import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIELD_SCHEMAS: Record<string, { fields: string[]; prompt: string }> = {
  hms_card: {
    fields: ["full_name", "hms_card_number", "expires_at"],
    prompt: "This is an HMS card (Norwegian workplace health/safety card). Extract: full_name (cardholder name), hms_card_number (card number), expires_at (expiry date in YYYY-MM-DD format).",
  },
  trade_certificate: {
    fields: ["trade_type", "issue_year"],
    prompt: "This is a Norwegian trade certificate (fagbrev/svennebrev). Extract: trade_type (e.g. Elektriker, Rørlegger), issue_year (year issued as YYYY).",
  },
  course_certificate: {
    fields: ["course_name", "expires_at"],
    prompt: "This is a course certificate. Extract: course_name (name of the course), expires_at (expiry date in YYYY-MM-DD if present, null otherwise).",
  },
  driver_license: {
    fields: ["birth_date", "license_classes", "expires_at"],
    prompt: "This is a driver's license. Extract: birth_date (YYYY-MM-DD), license_classes (comma-separated e.g. B,BE,C1), expires_at (expiry date YYYY-MM-DD).",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { document_id, file_path, forced_doc_type } = await req.json();
    if (!document_id || !file_path) {
      return new Response(JSON.stringify({ error: "Missing document_id or file_path" }), { status: 400, headers: corsHeaders });
    }

    // Download file from private storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("user-documents")
      .download(file_path);

    if (downloadError || !fileData) {
      return new Response(JSON.stringify({ error: "Failed to download file", details: downloadError?.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert to base64 for AI
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);
    const mimeType = fileData.type || "application/octet-stream";

    // Build classification + extraction prompt
    const docTypes = Object.keys(FIELD_SCHEMAS);
    const classificationPrompt = forced_doc_type
      ? ""
      : `First, classify this document as one of: ${docTypes.join(", ")}, or "unknown". `;

    const extractionInstructions = forced_doc_type && FIELD_SCHEMAS[forced_doc_type]
      ? FIELD_SCHEMAS[forced_doc_type].prompt
      : Object.entries(FIELD_SCHEMAS).map(([type, s]) => `If ${type}: ${s.prompt}`).join("\n");

    const systemPrompt = `You are a document analysis assistant for a Norwegian construction company's personnel system.
${classificationPrompt}Then extract the relevant fields.
${extractionInstructions}

Return a JSON object with this exact structure (no markdown, just raw JSON):
{
  "doc_type": "<detected or forced type>",
  "extracted_fields": { <field_name>: <value or null> },
  "confidence": { <field_name>: <number 0-100> },
  "warnings": ["<any issues>"]
}

If you cannot determine a field, set it to null with confidence 0.
Dates must be in YYYY-MM-DD format.
All text should be in Norwegian where applicable.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this document and extract the relevant fields." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Parse JSON from response (strip markdown fences if present)
    let parsed: any;
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({
        error: "AI returned unparseable response",
        raw: content,
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save extracted data to user_documents
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    await adminClient.from("user_documents").update({
      doc_type: parsed.doc_type || "unknown",
      extracted_fields_json: parsed.extracted_fields || {},
      confidence_json: parsed.confidence || {},
      ai_processed_at: new Date().toISOString(),
    }).eq("id", document_id);

    return new Response(JSON.stringify({
      doc_type: parsed.doc_type,
      extracted_fields: parsed.extracted_fields,
      confidence: parsed.confidence,
      warnings: parsed.warnings || [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-user-document error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
