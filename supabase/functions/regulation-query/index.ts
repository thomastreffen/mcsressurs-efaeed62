import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { question, topic, scope_type, scope_id, context_text, context_json, company_id } = await req.json();

    if (!question?.trim()) throw new Error("Spørsmål er påkrevd");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build context for AI
    let fullContext = "";
    if (context_text) fullContext += `\nKontekst:\n${context_text}`;
    if (context_json) {
      const lines = Array.isArray(context_json) ? context_json : [];
      if (lines.length > 0) {
        fullContext += "\n\nKalkylelinjer:\n";
        lines.forEach((line: any, i: number) => {
          fullContext += `${i + 1}. ${line.title} — ${line.quantity} ${line.unit || "stk"} à kr ${line.unit_price}\n`;
          if (line.description) fullContext += `   Beskrivelse: ${line.description}\n`;
        });
      }
    }

    const systemPrompt = `Du er en norsk fagekspert innen elektro og installasjon. Du har dyp kunnskap om:
- NEK 400 (Norsk Elektroteknisk Komité – installasjonsstandard)
- FEL (Forskrift om elektriske lavspenningsanlegg)
- FSE (Forskrift om sikkerhet ved arbeid i og drift av elektriske anlegg)
- FSL (Forskrift om elektriske forsyningsanlegg)

Du gir faglig veiledning basert på prinsipper i disse forskriftene. Du siterer IKKE standardtekst direkte, men forklarer relevante prinsipper og krav.

VIKTIG: Du MÅ alltid svare i følgende JSON-struktur med tool call. Ikke svar i fritekst.

Svarstrukturen:
- summary: Kort oppsummering (1-2 setninger)
- practical_meaning: Hva dette betyr i praksis for prosjektet
- actions: Array med anbefalte tiltak (hvert element har "title" og "description")
- pitfalls: Array med fallgruver/risiko (hvert element har "title" og "description")
- disclaimer: Fast tekst om at dette er veiledning, ikke juridisk rådgivning

Hold svarene konkrete, praktiske og relevante for en elektriker/prosjektleder i felt.`;

    const userPrompt = `Emne: ${topic || "Generelt"}

Spørsmål: ${question}${fullContext}`;

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
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "regulation_answer",
              description: "Return structured regulation answer",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "Kort oppsummering" },
                  practical_meaning: { type: "string", description: "Praktisk betydning i prosjekt" },
                  actions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["title", "description"],
                    },
                    description: "Anbefalte tiltak",
                  },
                  pitfalls: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["title", "description"],
                    },
                    description: "Fallgruver og risiko",
                  },
                  disclaimer: { type: "string", description: "Forbehold" },
                },
                required: ["summary", "practical_meaning", "actions", "pitfalls", "disclaimer"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "regulation_answer" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "For mange forespørsler. Prøv igjen om litt." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI-kreditter er oppbrukt." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any;

    if (toolCall?.function?.arguments) {
      parsed = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } else {
      // Fallback
      parsed = {
        summary: aiData.choices?.[0]?.message?.content || "Kunne ikke generere svar",
        practical_meaning: "",
        actions: [],
        pitfalls: [],
        disclaimer: "AI gir veiledning – original forskrift må sjekkes ved tvil.",
      };
    }

    // Save to database
    const { data: saved, error: saveError } = await supabase.from("regulation_queries").insert({
      created_by: user.id,
      company_id: company_id || null,
      scope_type: scope_type || "global",
      scope_id: scope_id || null,
      topic: topic || "Annet",
      question,
      context_text: context_text || null,
      context_json: context_json || null,
      answer_summary: parsed.summary,
      answer_detail: parsed.practical_meaning,
      actions: parsed.actions || [],
      pitfalls: parsed.pitfalls || [],
      tags: [],
      pinned: false,
    }).select().single();

    if (saveError) {
      console.error("Save error:", saveError);
      // Still return answer even if save fails
    }

    return new Response(JSON.stringify({
      id: saved?.id,
      ...parsed,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("regulation-query error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
