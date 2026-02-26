import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { document_id, text_content } = await req.json();
    if (!document_id && !text_content) {
      return new Response(JSON.stringify({ error: "document_id or text_content required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let content = text_content || "";

    // If document_id, try to get text from document
    if (document_id && !content) {
      const { data: doc } = await supabase
        .from("documents")
        .select("file_name, file_path, storage_bucket")
        .eq("id", document_id)
        .single();

      if (doc) {
        content = `[Dokument: ${doc.file_name}] - Analyser dette dokumentet og foreslå en skjemastruktur basert på innholdet.`;
      }
    }

    const systemPrompt = `Du er en ekspert på å analysere norske fagdokumenter og skjemaer.
Analyser teksten og foreslå en skjemamal-struktur med seksjoner og felter.

Returner resultatet som et JSON-objekt med denne strukturen:
{
  "title": "Foreslått malnavn",
  "sections": [
    {
      "label": "Seksjonsnavn",
      "fields": [
        {
          "type": "checkbox_yes_no" | "checkbox_list" | "text" | "textarea" | "number" | "date" | "signature" | "photo_upload",
          "label": "Feltnavn",
          "required": true/false,
          "options": ["alt1", "alt2"], // kun for checkbox_list
          "confidence": 0.0-1.0
        }
      ]
    }
  ]
}

Regler:
- Bruk section_header for å gruppere relaterte felter
- Bruk checkbox_yes_no for ja/nei-spørsmål
- Bruk checkbox_list for flervalg
- Bruk signature for signaturfelt
- Sett confidence basert på hvor sikker du er på felt-mappingen`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_form_structure",
              description: "Return a suggested form template structure",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  sections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        fields: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              type: { type: "string", enum: ["checkbox_yes_no", "checkbox_list", "text", "textarea", "number", "date", "signature", "photo_upload"] },
                              label: { type: "string" },
                              required: { type: "boolean" },
                              options: { type: "array", items: { type: "string" } },
                              confidence: { type: "number" },
                            },
                            required: ["type", "label", "confidence"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["label", "fields"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["title", "sections"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_form_structure" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit – prøv igjen om litt" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Kreditter oppbrukt" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI-analyse feilet" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    let parsed = {};
    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch {
        parsed = { error: "Could not parse AI response" };
      }
    }

    // Calculate avg confidence
    let totalConf = 0;
    let fieldCount = 0;
    const sections = (parsed as any).sections || [];
    for (const s of sections) {
      for (const f of s.fields || []) {
        totalConf += f.confidence || 0;
        fieldCount++;
      }
    }
    const avgConfidence = fieldCount > 0 ? totalConf / fieldCount : 0;

    return new Response(
      JSON.stringify({
        parsed_json: parsed,
        confidence: Math.round(avgConfidence * 100),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("parse-form-pdf error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
