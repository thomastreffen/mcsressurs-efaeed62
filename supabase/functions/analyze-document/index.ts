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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims)
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const userId = claimsData.claims.sub as string;
    const { document_id, job_id, analysis_type } = await req.json();

    if (!document_id || !analysis_type) throw new Error("document_id and analysis_type required");

    // Get document
    const { data: doc, error: docErr } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download file
    const { data: fileData, error: fileErr } = await supabaseAdmin.storage
      .from(doc.storage_bucket)
      .download(doc.file_path);

    if (fileErr || !fileData) {
      return new Response(JSON.stringify({ error: "Could not download file" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const arrayBuf = await fileData.arrayBuffer();
    let userContent: any[];

    if (doc.mime_type === "application/pdf") {
      const bytes = new Uint8Array(arrayBuf).slice(0, 100000);
      const base64 = btoa(String.fromCharCode(...bytes));
      userContent = [
        { type: "text", text: `Analyser dette ${analysis_type === "offer" ? "tilbudet" : "kontrakten"} og trekk ut all relevant informasjon.` },
        { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
      ];
    } else {
      const text = new TextDecoder().decode(new Uint8Array(arrayBuf));
      userContent = [
        { type: "text", text: `Analyser dette ${analysis_type === "offer" ? "tilbudet" : "kontrakten"}:\n\n${text.substring(0, 50000)}` },
      ];
    }

    // Build tool schema based on type
    const toolSchema = analysis_type === "offer"
      ? {
          name: "analyze_offer",
          description: "Extract structured offer analysis",
          parameters: {
            type: "object",
            properties: {
              total_amount: { type: ["number", "null"], description: "Total amount" },
              currency: { type: ["string", "null"], description: "Currency code" },
              scope_summary: { type: ["string", "null"], description: "Short scope bullets" },
              reservations: { type: "array", items: { type: "string" }, description: "Reservations/forbehold" },
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
              risk_flags: { type: "array", items: { type: "string" }, description: "Red flags: dagmulkt, liability, warranty, change orders" },
            },
            required: ["parties", "start_date", "end_date", "payment_terms", "risk_flags"],
            additionalProperties: false,
          },
        };

    const toolName = analysis_type === "offer" ? "analyze_offer" : "analyze_contract";

    // Call AI
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: analysis_type === "offer"
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

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "For mange forespørsler. Prøv igjen om litt.", error_code: "rate_limit" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI-kreditter oppbrukt.", error_code: "payment_required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", status, errText);
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No structured output from AI");

    const parsed = JSON.parse(toolCall.function.arguments);

    // Count existing analyses for versioning
    const { count } = await supabaseAdmin
      .from("document_analyses")
      .select("id", { count: "exact", head: true })
      .eq("document_id", document_id);

    // Save analysis
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
      console.error("Insert analysis error:", insertErr);
      throw new Error("Could not save analysis");
    }

    return new Response(JSON.stringify({ ok: true, analysis: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    if (err.name === "AbortError") {
      return new Response(JSON.stringify({ error: "AI-analyse tok for lang tid. Prøv igjen.", error_code: "ai_timeout" }), {
        status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("analyze-document error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
