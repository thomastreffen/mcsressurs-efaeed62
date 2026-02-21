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

VIKTIG: Du skal være KRITISK og faglig presis.

Hvis beskrivelsen mangler kritisk informasjon som gjør det umulig å lage en realistisk kalkyle, 
SKAL du returnere et tool call til "report_insufficient_data" funksjonen.

Eksempler på kritisk informasjon som ofte mangler:
- Lengde på føringsvei / kabeltrasé
- Dimensjon på sikringer / vern
- Antall kurser / avganger
- Type installasjon (nybygg vs eksisterende)
- Montasjehøyde / tilgjengelighet
- Omfang (antall enheter, rom, etasjer)

Hvis du HAR nok informasjon til å lage et realistisk estimat:
- Bruk tool call til "generate_calculation" funksjonen
- Vær konservativ i estimater
- Inkluder alltid forutsetninger du baserer estimatet på
- Sett confidence_level basert på hvor komplett inputen er
- Sett requires_manual_review = true hvis du gjør mange antagelser

Regler:
- Alle priser skal være i NOK
- Materialer skal ha realistiske innkjøpspriser (før påslag)
- Arbeidstimer skal estimeres konservativt
- Tenk på norske forskrifter (NEK 400, FEK)

Materialfaktor (påslag på innkjøpspris): ${material_multiplier || 2.0}x
Timepris: ${hour_rate || 1080} kr/time`;

    const userPrompt = `Prosjekt: ${project_title || "Ikke spesifisert"}
Kunde: ${customer_name || "Ikke spesifisert"}

Beskrivelse av arbeidet:
${description}

Analyser dette arbeidet. Hvis informasjonen er utilstrekkelig, bruk report_insufficient_data. Hvis du har nok informasjon, generer en komplett kalkulasjon med generate_calculation.`;

    const aiController = new AbortController();
    const aiTimeout = setTimeout(() => aiController.abort(), 20000);

    let response: Response;
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: aiController.signal,
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
              name: "report_insufficient_data",
              description: "Report that the description lacks critical information needed for a realistic calculation.",
              parameters: {
                type: "object",
                properties: {
                  missing_information: {
                    type: "array",
                    items: { type: "string" },
                    description: "Liste over manglende informasjon som trengs",
                  },
                  clarifying_questions: {
                    type: "array",
                    items: { type: "string" },
                    description: "Oppfølgingsspørsmål for å få nok data",
                  },
                },
                required: ["missing_information", "clarifying_questions"],
                additionalProperties: false,
              },
            },
          },
          {
            type: "function",
            function: {
              name: "generate_calculation",
              description: "Generate a structured job calculation with materials, labor and risk assessment.",
              parameters: {
                type: "object",
                properties: {
                  confidence_level: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                    description: "Hvor sikker AI er på estimatet",
                  },
                  requires_manual_review: {
                    type: "boolean",
                    description: "Om estimatet bør gjennomgås manuelt",
                  },
                  assumptions: {
                    type: "array",
                    items: { type: "string" },
                    description: "Forutsetninger AI baserer estimatet på",
                  },
                  job_summary: {
                    type: "string",
                    description: "Kort oppsummering av arbeidet (2-4 setninger)",
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
                  estimated_duration_days: { type: "number" },
                  recommended_technicians: { type: "number" },
                },
                required: ["confidence_level", "requires_manual_review", "assumptions", "job_summary", "job_type", "materials", "labor", "risk_notes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: "auto",
        }),
      });
    } catch (fetchErr: any) {
      clearTimeout(aiTimeout);
      if (fetchErr.name === "AbortError") {
        return new Response(JSON.stringify({ error: "AI-analyse tok for lang tid. Prøv igjen.", error_code: "ai_timeout" }), {
          status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw fetchErr;
    }
    clearTimeout(aiTimeout);

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

    // If the AI chose to report insufficient data
    if (toolCall.function.name === "report_insufficient_data") {
      return new Response(JSON.stringify({ status: "insufficient_data", ...analysis }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
