import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { description, project_title, customer_name, material_multiplier, hour_rate } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `Du er en erfaren elektriker-kalkulator for MCS Service AS, et norsk el-firma.

Din oppgave er å analysere en jobbeskrivelse og generere en strukturert kalkulasjon.

Regler:
- Alle priser skal være i NOK
- Materialer skal ha realistiske innkjøpspriser (før påslag)
- Arbeidstimer skal estimeres konservativt
- Inkluder alltid relevante sikkerhetsmessige vurderinger
- Tenk på norske forskrifter (NEK 400, FEK)

Materialfaktor (påslag på innkjøpspris): ${material_multiplier || 2.0}x
Timepris: ${hour_rate || 1080} kr/time

Du MÅ svare med et tool call til "generate_calculation" funksjonen.`;

    const userPrompt = `Prosjekt: ${project_title || "Ikke spesifisert"}
Kunde: ${customer_name || "Ikke spesifisert"}

Beskrivelse av arbeidet:
${description}

Analyser dette arbeidet og generer en komplett kalkulasjon med materialer, arbeidstimer og risikovurdering.`;

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
              name: "generate_calculation",
              description: "Generate a structured job calculation with materials, labor and risk assessment.",
              parameters: {
                type: "object",
                properties: {
                  job_summary: {
                    type: "string",
                    description: "Kort oppsummering av arbeidet som skal utføres (2-4 setninger)",
                  },
                  job_type: {
                    type: "string",
                    description: "Type jobb, f.eks. 'Installasjon', 'Service', 'Reparasjon', 'Nybygg'",
                  },
                  materials: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Produktnavn" },
                        description: { type: "string", description: "Kort beskrivelse" },
                        quantity: { type: "number" },
                        unit: { type: "string", description: "Enhet: stk, m, m², pakke, etc." },
                        unit_price: { type: "number", description: "Innkjøpspris per enhet i NOK" },
                      },
                      required: ["title", "quantity", "unit", "unit_price"],
                      additionalProperties: false,
                    },
                  },
                  labor: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Arbeidsbeskrivelse" },
                        description: { type: "string" },
                        hours: { type: "number", description: "Estimerte timer" },
                      },
                      required: ["title", "hours"],
                      additionalProperties: false,
                    },
                  },
                  risk_notes: {
                    type: "array",
                    items: { type: "string" },
                    description: "Liste over risikovurderinger og forbehold",
                  },
                  estimated_duration_days: {
                    type: "number",
                    description: "Estimert antall arbeidsdager",
                  },
                  recommended_technicians: {
                    type: "number",
                    description: "Anbefalt antall montører",
                  },
                },
                required: ["job_summary", "job_type", "materials", "labor", "risk_notes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_calculation" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "AI-tjenesten er midlertidig overbelastet. Prøv igjen om litt." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI-kreditter er brukt opp. Kontakt administrator." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI-analyse feilet" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(result));
      return new Response(JSON.stringify({ error: "AI returnerte ikke strukturert data" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const analysis = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-calculation-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Ukjent feil" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
