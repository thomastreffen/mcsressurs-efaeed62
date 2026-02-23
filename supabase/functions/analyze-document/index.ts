import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT_CHARS = 60_000;
const MIN_PDF_TEXT_CHARS = 800;

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function jsonError(
  requestId: string,
  errorType: string,
  message: string,
  status = 400,
) {
  return new Response(
    JSON.stringify({ ok: false, requestId, errorType, message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function getAuthUserId(
  supabase: any,
  token: string,
): Promise<{ userId: string | null; error: string | null }> {
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) return { userId: null, error: "Ugyldig token" };
  return { userId: data.claims.sub as string, error: null };
}

async function downloadDocument(
  supabaseAdmin: any,
  doc: any,
  requestId: string,
): Promise<{ fileData: Blob | null; fetchMs: number; error: string | null }> {
  const t0 = Date.now();
  const { data, error } = await supabaseAdmin.storage
    .from(doc.storage_bucket)
    .download(doc.file_path);
  const fetchMs = Date.now() - t0;

  if (error || !data) {
    console.error(`[analyze-document] rid=${requestId} download failed:`, error);
    return { fileData: null, fetchMs, error: "Kunne ikke laste ned filen fra lagring" };
  }

  console.info(
    `[analyze-document] rid=${requestId} downloaded in ${fetchMs}ms, type=${data.type}, size=${data.size}`,
  );
  return { fileData: data, fetchMs, error: null };
}

function extractPdfText(arrayBuf: ArrayBuffer): string {
  // Lightweight heuristic text extraction from PDF binary.
  // Works for most text-based PDFs. Not a full parser – if this fails,
  // the function falls back to sending the PDF as base64 to AI.
  try {
    const bytes = new Uint8Array(arrayBuf);
    const raw = new TextDecoder("latin1").decode(bytes);

    const textParts: string[] = [];

    // Extract text between BT...ET blocks (PDF text objects)
    const btEtRegex = /BT\s([\s\S]*?)ET/g;
    let match: RegExpExecArray | null;
    while ((match = btEtRegex.exec(raw)) !== null) {
      const block = match[1];
      // Extract strings inside parentheses (Tj/TJ operators)
      const strRegex = /\(([^)]*)\)/g;
      let strMatch: RegExpExecArray | null;
      while ((strMatch = strRegex.exec(block)) !== null) {
        const decoded = strMatch[1]
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\\(/g, "(")
          .replace(/\\\)/g, ")")
          .replace(/\\\\/g, "\\");
        if (decoded.trim()) textParts.push(decoded);
      }
    }

    return textParts.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function buildUserContentFromText(
  prompt: string,
  text: string,
): Array<{ type: string; text: string }> {
  const truncated = text.substring(0, MAX_TEXT_CHARS);
  return [{ type: "text", text: `${prompt}\n\n${truncated}` }];
}

function getPrompt(analysisType: string): string {
  return analysisType === "offer"
    ? "Analyser dette tilbudet og trekk ut all relevant informasjon."
    : "Analyser denne kontrakten og trekk ut strukturert informasjon med fokus på risiko og forpliktelser.";
}

function getSystemPrompt(analysisType: string): string {
  return analysisType === "offer"
    ? "Du er en ekspert tilbudsanalytiker for bygg- og elektrobransjen i Norge. Analyser tilbudsdokumentet og trekk ut strukturert informasjon. Vær presis."
    : "Du er en ekspert kontraktanalytiker for bygg- og elektrobransjen i Norge. Analyser kontraktdokumentet og trekk ut strukturert informasjon med fokus på risiko og forpliktelser. Vær presis.";
}

function getToolSchema(analysisType: string) {
  if (analysisType === "offer") {
    return {
      name: "analyze_offer",
      description: "Extract structured offer analysis",
      parameters: {
        type: "object",
        properties: {
          total_amount: { type: ["number", "null"], description: "Total amount" },
          currency: { type: ["string", "null"], description: "Currency code" },
          scope_summary: { type: ["string", "null"], description: "Short scope bullets" },
          reservations: { type: "array", items: { type: "string" }, description: "Reservations" },
          line_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                amount: { type: ["number", "null"] },
              },
            },
          },
        },
        required: ["total_amount", "currency", "scope_summary", "reservations"],
        additionalProperties: false,
      },
    };
  }
  return {
    name: "analyze_contract",
    description: "Extract structured contract analysis",
    parameters: {
      type: "object",
      properties: {
        parties: { type: ["string", "null"], description: "Contract parties" },
        start_date: { type: ["string", "null"], description: "Start date ISO" },
        end_date: { type: ["string", "null"], description: "End date ISO" },
        milestones: { type: "array", items: { type: "string" } },
        payment_terms: { type: ["string", "null"] },
        key_obligations: { type: "array", items: { type: "string" } },
        risk_flags: {
          type: "array",
          items: { type: "string" },
          description: "Red flags: dagmulkt, liability, warranty, change orders",
        },
      },
      required: ["parties", "start_date", "end_date", "payment_terms", "risk_flags"],
      additionalProperties: false,
    },
  };
}

async function callAi(
  userContent: any[],
  analysisType: string,
  lovableKey: string,
  requestId: string,
): Promise<{ result: any | null; aiMs: number; errorResponse: Response | null }> {
  const toolSchema = getToolSchema(analysisType);
  const toolName = toolSchema.name;

  const t0 = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);

  let aiResponse: Response;
  try {
    aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: getSystemPrompt(analysisType) },
          { role: "user", content: userContent },
        ],
        tools: [{ type: "function", function: toolSchema }],
        tool_choice: { type: "function", function: { name: toolName } },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const aiMs = Date.now() - t0;

  if (!aiResponse.ok) {
    const aiStatus = aiResponse.status;
    const errText = await aiResponse.text();
    console.error(`[analyze-document] rid=${requestId} AI error ${aiStatus}: ${errText}`);

    if (aiStatus === 429) {
      return { result: null, aiMs, errorResponse: jsonError(requestId, "RATE_LIMIT", "For mange forespørsler. Prøv igjen om litt.", 429) };
    }
    if (aiStatus === 402) {
      return { result: null, aiMs, errorResponse: jsonError(requestId, "PAYMENT_REQUIRED", "AI-kreditter oppbrukt.", 402) };
    }
    if (errText.includes("no pages") || errText.includes("INVALID_ARGUMENT")) {
      return { result: null, aiMs, errorResponse: jsonError(requestId, "SCANNED_PDF", "AI kunne ikke lese PDF-en (ingen sider/tekst). Prøv å lime inn teksten manuelt.") };
    }
    return { result: null, aiMs, errorResponse: jsonError(requestId, "AI_ERROR", `AI-analyse feilet (${aiStatus}). Prøv igjen.`, 502) };
  }

  const aiResult = await aiResponse.json();
  const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    console.error(`[analyze-document] rid=${requestId} no tool_call in response`);
    return { result: null, aiMs, errorResponse: jsonError(requestId, "AI_NO_OUTPUT", "AI returnerte ikke strukturert resultat. Prøv igjen.", 502) };
  }

  // Parse with try/catch for OUTPUT_PARSE_ERROR
  let parsed: any;
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch (parseErr) {
    console.error(`[analyze-document] rid=${requestId} JSON.parse failed:`, parseErr, "raw:", toolCall.function.arguments);
    return {
      result: null,
      aiMs,
      errorResponse: jsonError(requestId, "OUTPUT_PARSE_ERROR", "AI returnerte uventet format. Prøv igjen eller bruk manuell tekst.", 502),
    };
  }

  return { result: { aiResult, parsed }, aiMs, errorResponse: null };
}

async function saveAnalysis(
  supabaseAdmin: any,
  params: {
    document_id: string;
    job_id: string | null;
    analysis_type: string;
    aiResult: any;
    parsed: any;
    userId: string;
  },
  requestId: string,
): Promise<Response | null> {
  const { document_id, job_id, analysis_type, aiResult, parsed, userId } = params;

  const { count } = await supabaseAdmin
    .from("document_analyses")
    .select("id", { count: "exact", head: true })
    .eq("document_id", document_id);

  const { error: insertErr } = await supabaseAdmin.from("document_analyses").insert({
    document_id,
    job_id: job_id || null,
    analysis_type,
    raw_output: aiResult,
    parsed_fields: parsed,
    confidence: 85,
    version: (count || 0) + 1,
    analyzed_by: userId,
  });

  if (insertErr) {
    console.error(`[analyze-document] rid=${requestId} insert error:`, insertErr);
    return jsonError(requestId, "DB_ERROR", "Kunne ikke lagre analyseresultat", 500);
  }
  return null;
}

// ──────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const t0 = Date.now();
  let userId = "unknown";
  let step = "init";

  try {
    // ── Auth ──
    step = "auth";
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonError(requestId, "UNAUTHORIZED", "Missing auth token", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return jsonError(requestId, "CONFIG_ERROR", "AI-nøkkel mangler på server", 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { userId: uid, error: authErr } = await getAuthUserId(supabase, token);
    if (authErr || !uid) {
      return jsonError(requestId, "UNAUTHORIZED", "Ugyldig token", 401);
    }
    userId = uid;

    // ── Parse body ──
    const { document_id, job_id, analysis_type, manual_text } = await req.json();
    if (!document_id || !analysis_type) {
      return jsonError(requestId, "VALIDATION", "document_id og analysis_type er påkrevd");
    }

    console.info(
      `[analyze-document] rid=${requestId} user=${userId} doc=${document_id} job=${job_id} type=${analysis_type}`,
    );

    // ── Fetch document metadata ──
    step = "fetch_doc";
    const { data: doc, error: docErr } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docErr || !doc) {
      return jsonError(requestId, "NOT_FOUND", "Dokument ikke funnet", 404);
    }

    const prompt = getPrompt(analysis_type);
    let userContent: any[];

    // ── Manual text fallback ──
    if (manual_text && typeof manual_text === "string" && manual_text.trim().length > 0) {
      step = "manual_text";
      console.info(`[analyze-document] rid=${requestId} using manual_text (${manual_text.length} chars)`);
      userContent = buildUserContentFromText(prompt, manual_text);
    } else {
      // ── Download file from storage ──
      step = "download";
      const { fileData, fetchMs, error: dlErr } = await downloadDocument(supabaseAdmin, doc, requestId);
      if (dlErr || !fileData) {
        return jsonError(requestId, "DOWNLOAD_FAILED", dlErr || "Kunne ikke laste ned filen", 500);
      }

      // ── Validate file size ──
      step = "validate";
      if (fileData.size > MAX_FILE_SIZE) {
        return jsonError(
          requestId,
          "FILE_TOO_LARGE_FOR_AI",
          `Filen er for stor for AI-analyse (${(fileData.size / 1024 / 1024).toFixed(1)} MB). ` +
            `Maks ${MAX_FILE_SIZE / 1024 / 1024} MB. Last opp en komprimert versjon, eller lim inn teksten manuelt.`,
        );
      }

      const isPdf =
        doc.mime_type === "application/pdf" ||
        doc.file_name?.toLowerCase().endsWith(".pdf");
      const isImage = doc.mime_type?.startsWith("image/");
      const isText =
        doc.mime_type?.startsWith("text/") ||
        ["application/json", "application/xml"].includes(doc.mime_type);
      const isWord =
        doc.mime_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        doc.mime_type === "application/msword";

      if (!isPdf && !isText && !isWord && !isImage) {
        return jsonError(
          requestId,
          "INVALID_FILE",
          `Filtypen ${doc.mime_type} støttes ikke for AI-analyse. Last opp PDF, Word, bilde eller tekstfil.`,
        );
      }

      // ── Build AI content ──
      step = "build_content";
      const arrayBuf = await fileData.arrayBuffer();

      if (isPdf) {
        // Try local text extraction first
        step = "pdf_text_extract";
        const extractedText = extractPdfText(arrayBuf);
        console.info(
          `[analyze-document] rid=${requestId} PDF text extraction: ${extractedText.length} chars`,
        );

        if (extractedText.length >= MIN_PDF_TEXT_CHARS) {
          // Good text content – send as plain text (faster, more reliable)
          console.info(`[analyze-document] rid=${requestId} using extracted PDF text`);
          userContent = buildUserContentFromText(prompt, extractedText);
        } else if (extractedText.length > 0 && extractedText.length < MIN_PDF_TEXT_CHARS) {
          // Too little text – likely scanned
          return jsonError(
            requestId,
            "PDF_TEXT_MISSING",
            "PDF-en ser skannet ut eller inneholder for lite tekst. Lim inn tekst manuelt i stedet.",
          );
        } else {
          // No text extracted at all – fall back to base64 PDF via AI vision
          console.warn(
            `[analyze-document] rid=${requestId} no text extracted, falling back to base64 PDF`,
          );
          step = "pdf_base64_fallback";
          const base64 = encodeBase64(new Uint8Array(arrayBuf));
          userContent = [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:application/pdf;base64,${base64}` },
            },
          ];
        }
      } else if (isImage) {
        const base64 = encodeBase64(new Uint8Array(arrayBuf));
        userContent = [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${doc.mime_type};base64,${base64}` },
          },
        ];
      } else {
        // Text-based files (txt, json, xml, docx treated as text)
        const text = new TextDecoder().decode(new Uint8Array(arrayBuf));
        if (text.trim().length < 50) {
          return jsonError(
            requestId,
            "PDF_TEXT_MISSING",
            "Dokumentet inneholder for lite tekst for analyse. Lim inn teksten manuelt.",
          );
        }
        userContent = buildUserContentFromText(prompt, text);
      }
    }

    // ── Call AI ──
    step = "ai_call";
    const { result, aiMs, errorResponse } = await callAi(
      userContent,
      analysis_type,
      lovableKey,
      requestId,
    );
    if (errorResponse) return errorResponse;

    console.info(`[analyze-document] rid=${requestId} AI ok in ${aiMs}ms`);

    // ── Save analysis ──
    step = "save";
    const saveErr = await saveAnalysis(
      supabaseAdmin,
      {
        document_id,
        job_id: job_id || null,
        analysis_type,
        aiResult: result.aiResult,
        parsed: result.parsed,
        userId,
      },
      requestId,
    );
    if (saveErr) return saveErr;

    const totalMs = Date.now() - t0;
    console.info(`[analyze-document] rid=${requestId} done in ${totalMs}ms (ai=${aiMs}ms)`);

    return new Response(
      JSON.stringify({ ok: true, requestId, analysis: result.parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.error(`[analyze-document] rid=${requestId} timeout at step=${step}`);
      return jsonError(requestId, "AI_TIMEOUT", "AI-analyse tok for lang tid. Prøv igjen.", 504);
    }
    console.error(`[analyze-document] rid=${requestId} step=${step} error:`, err);
    return jsonError(requestId, "INTERNAL_ERROR", err.message || "Intern feil", 500);
  }
});
