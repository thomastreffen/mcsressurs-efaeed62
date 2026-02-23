import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT_CHARS = 60000;

function jsonError(
  requestId: string,
  errorType: string,
  message: string,
  status = 400
) {
  return new Response(
    JSON.stringify({ ok: false, requestId, errorType, message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const requestId = crypto.randomUUID();
  const t0 = Date.now();
  let userId = "unknown";
  let step = "init";

  try {
    // ── Auth ──
    step = "auth";
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return jsonError(requestId, "UNAUTHORIZED", "Missing auth token", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey)
      return jsonError(requestId, "CONFIG_ERROR", "AI-nøkkel mangler på server", 500);

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims)
      return jsonError(requestId, "UNAUTHORIZED", "Ugyldig token", 401);

    userId = claimsData.claims.sub as string;

    const { document_id, job_id, analysis_type, manual_text } = await req.json();
    if (!document_id || !analysis_type)
      return jsonError(requestId, "VALIDATION", "document_id og analysis_type er påkrevd");

    console.info(
      `[analyze-document] rid=${requestId} user=${userId} doc=${document_id} job=${job_id} type=${analysis_type}`
    );

    // ── Fetch document metadata ──
    step = "fetch_doc";
    const { data: doc, error: docErr } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docErr || !doc)
      return jsonError(requestId, "NOT_FOUND", "Dokument ikke funnet", 404);

    let userContent: any[];

    if (manual_text && typeof manual_text === "string" && manual_text.trim().length > 0) {
      // ── Manual text fallback ──
      step = "manual_text";
      console.info(`[analyze-document] rid=${requestId} using manual_text (${manual_text.length} chars)`);
      const truncated = manual_text.substring(0, MAX_TEXT_CHARS);
      const prompt = analysis_type === "offer"
        ? "Analyser dette tilbudet og trekk ut all relevant informasjon."
        : "Analyser denne kontrakten og trekk ut strukturert informasjon med fokus på risiko og forpliktelser.";
      userContent = [{ type: "text", text: `${prompt}\n\n${truncated}` }];
    } else {
      // ── Download file from storage ──
      step = "download";
      const tFetch0 = Date.now();
      const { data: fileData, error: fileErr } = await supabaseAdmin.storage
        .from(doc.storage_bucket)
        .download(doc.file_path);
      const fetchMs = Date.now() - tFetch0;

      if (fileErr || !fileData) {
        console.error(`[analyze-document] rid=${requestId} download failed:`, fileErr);
        return jsonError(requestId, "DOWNLOAD_FAILED", "Kunne ikke laste ned filen fra lagring", 500);
      }

      console.info(
        `[analyze-document] rid=${requestId} downloaded in ${fetchMs}ms, type=${fileData.type}, size=${fileData.size}`
      );

      // ── Validate file ──
      step = "validate";
      if (fileData.size > MAX_FILE_SIZE) {
        return jsonError(
          requestId,
          "FILE_TOO_LARGE",
          `Filen er for stor for AI-analyse (${(fileData.size / 1024 / 1024).toFixed(1)} MB). Maks ${MAX_FILE_SIZE / 1024 / 1024} MB.`
        );
      }

      const isPdf = doc.mime_type === "application/pdf" || doc.file_name?.toLowerCase().endsWith(".pdf");
      const isText =
        doc.mime_type?.startsWith("text/") ||
        ["application/json", "application/xml"].includes(doc.mime_type);
      const isWord =
        doc.mime_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        doc.mime_type === "application/msword";
      const isImage = doc.mime_type?.startsWith("image/");

      if (!isPdf && !isText && !isWord && !isImage) {
        return jsonError(
          requestId,
          "INVALID_FILE",
          `Filtypen ${doc.mime_type} støttes ikke for AI-analyse. Last opp PDF, Word, bilde eller tekstfil.`
        );
      }

      // ── Build content for AI ──
      step = "build_content";
      const arrayBuf = await fileData.arrayBuffer();
      const prompt = analysis_type === "offer"
        ? "Analyser dette tilbudet og trekk ut all relevant informasjon."
        : "Analyser denne kontrakten og trekk ut strukturert informasjon med fokus på risiko og forpliktelser.";

      if (isPdf) {
        // Send PDF as proper base64 inline_data for Gemini
        const bytes = new Uint8Array(arrayBuf);
        const base64 = btoa(String.fromCharCode(...bytes));
        userContent = [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:application/pdf;base64,${base64}` },
          },
        ];
      } else if (isImage) {
        const bytes = new Uint8Array(arrayBuf);
        const base64 = btoa(String.fromCharCode(...bytes));
        userContent = [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${doc.mime_type};base64,${base64}` },
          },
        ];
      } else {
        // Text-based: decode and send as text
        const text = new TextDecoder().decode(new Uint8Array(arrayBuf));
        if (text.trim().length < 50) {
          return jsonError(
            requestId,
            "SCANNED_PDF",
            "Dokumentet ser ut til å være skannet eller inneholder for lite tekst. Lim inn teksten manuelt i stedet."
          );
        }
        userContent = [
          { type: "text", text: `${prompt}\n\n${text.substring(0, MAX_TEXT_CHARS)}` },
        ];
      }
    }

    // ── Tool schema ──
    const toolSchema =
      analysis_type === "offer"
        ? {
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
          }
        : {
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

    const toolName = analysis_type === "offer" ? "analyze_offer" : "analyze_contract";

    // ── Call AI ──
    step = "ai_call";
    const tAi0 = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              analysis_type === "offer"
                ? "Du er en ekspert tilbudsanalytiker for bygg- og elektrobransjen i Norge. Analyser tilbudsdokumentet og trekk ut strukturert informasjon. Vær presis."
                : "Du er en ekspert kontraktanalytiker for bygg- og elektrobransjen i Norge. Analyser kontraktdokumentet og trekk ut strukturert informasjon med fokus på risiko og forpliktelser. Vær presis.",
          },
          { role: "user", content: userContent },
        ],
        tools: [{ type: "function", function: toolSchema }],
        tool_choice: { type: "function", function: { name: toolName } },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const aiMs = Date.now() - tAi0;

    if (!aiResponse.ok) {
      const aiStatus = aiResponse.status;
      const errText = await aiResponse.text();
      console.error(`[analyze-document] rid=${requestId} AI error ${aiStatus}: ${errText}`);

      if (aiStatus === 429) {
        return jsonError(requestId, "RATE_LIMIT", "For mange forespørsler. Prøv igjen om litt.", 429);
      }
      if (aiStatus === 402) {
        return jsonError(requestId, "PAYMENT_REQUIRED", "AI-kreditter oppbrukt.", 402);
      }
      // Check for "no pages" error from Gemini
      if (errText.includes("no pages") || errText.includes("INVALID_ARGUMENT")) {
        return jsonError(
          requestId,
          "SCANNED_PDF",
          "AI kunne ikke lese PDF-en (ingen sider/tekst). Prøv å lime inn teksten manuelt."
        );
      }
      return jsonError(requestId, "AI_ERROR", `AI-analyse feilet (${aiStatus}). Prøv igjen.`, 502);
    }

    // ── Parse AI response ──
    step = "parse_ai";
    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error(`[analyze-document] rid=${requestId} no tool_call in response`);
      return jsonError(requestId, "AI_NO_OUTPUT", "AI returnerte ikke strukturert resultat. Prøv igjen.", 502);
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    console.info(`[analyze-document] rid=${requestId} AI ok in ${aiMs}ms`);

    // ── Save analysis ──
    step = "save";
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

    const totalMs = Date.now() - t0;
    console.info(`[analyze-document] rid=${requestId} done in ${totalMs}ms (ai=${aiMs}ms)`);

    return new Response(
      JSON.stringify({ ok: true, requestId, analysis: parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
