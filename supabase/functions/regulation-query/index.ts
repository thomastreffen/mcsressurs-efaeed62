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

VIKTIG: Du MÅ alltid svare med tool call. Ikke svar i fritekst.

Svarstrukturen:
- summary: Kort oppsummering (1-2 setninger)
- practical_meaning: Hva dette betyr i praksis for prosjektet
- actions: Array med anbefalte tiltak (hvert element har "title" og "description")
- pitfalls: Array med fallgruver/risiko (hvert element har "title" og "description")
- references_to_check: Array med strenger - retningsgivende referanser brukeren bør sjekke selv (f.eks. "NEK 400 del 7-701 om våtrom", "FEL § 9 om kvalifikasjonskrav"). IKKE siter tekst, bare pek på relevante seksjoner.
- suggested_reservations: Array med 2-5 forbehold som bør tas med i tilbud/kalkyle (f.eks. "Forutsetter at eksisterende jordelektrode er i forskriftsmessig stand")
- suggested_calc_lines: Array med forslag til kalkylelinjer basert på spørsmålet. Hvert element har "title" (kort tittel), "category" (material|labor), "estimate_hint" (kort hint om omfang, f.eks. "2-4 timer" eller "1 stk per kurs"). Foreslå kun der det er naturlig.
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
                      properties: { title: { type: "string" }, description: { type: "string" } },
                      required: ["title", "description"],
                    },
                  },
                  pitfalls: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { title: { type: "string" }, description: { type: "string" } },
                      required: ["title", "description"],
                    },
                  },
                  references_to_check: {
                    type: "array",
                    items: { type: "string" },
                    description: "Relevante forskriftsseksjoner å sjekke (ikke sitat, kun retning)",
                  },
                  suggested_reservations: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-5 forbehold for tilbud/kalkyle",
                  },
                  suggested_calc_lines: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        category: { type: "string", enum: ["material", "labor"] },
                        estimate_hint: { type: "string" },
                      },
                      required: ["title", "category", "estimate_hint"],
                    },
                    description: "Forslag til kalkylelinjer",
                  },
                  disclaimer: { type: "string" },
                },
                required: ["summary", "practical_meaning", "actions", "pitfalls", "references_to_check", "suggested_reservations", "suggested_calc_lines", "disclaimer"],
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
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI-kreditter er oppbrukt." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      parsed = {
        summary: aiData.choices?.[0]?.message?.content || "Kunne ikke generere svar",
        practical_meaning: "",
        actions: [],
        pitfalls: [],
        references_to_check: [],
        suggested_reservations: [],
        suggested_calc_lines: [],
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
      references_to_check: parsed.references_to_check || [],
      suggested_reservations: parsed.suggested_reservations || [],
      suggested_calc_lines: parsed.suggested_calc_lines || [],
      tags: [],
      pinned: false,
    }).select().single();

    if (saveError) {
      console.error("Save error:", saveError);
    }

    // Create notification for reviewers when scope is job or quote
    if (saved && (scope_type === "job" || scope_type === "quote") && scope_id) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        
        // Check throttle: no more than 1 notification per scope_id per 2 hours
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const { count } = await supabaseAdmin
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("type", "regulation_review_needed")
          .eq("event_id", scope_id)
          .gte("created_at", twoHoursAgo);

        if (!count || count === 0) {
          // Find users with regulation.review permission
          const { data: reviewerAssignments } = await supabaseAdmin
            .from("role_permissions")
            .select("role_id")
            .eq("permission_key", "regulation.review")
            .eq("allowed", true);

          if (reviewerAssignments && reviewerAssignments.length > 0) {
            const roleIds = reviewerAssignments.map(r => r.role_id);
            const { data: userAssignments } = await supabaseAdmin
              .from("user_role_assignments")
              .select("user_id")
              .in("role_id", roleIds);

            if (userAssignments) {
              const uniqueUserIds = [...new Set(userAssignments.map(u => u.user_id))].filter(uid => uid !== user.id);
              const notifications = uniqueUserIds.map(uid => ({
                user_id: uid,
                type: "regulation_review_needed",
                title: `Ny fagforespørsel krever godkjenning`,
                message: `${topic}: ${question.substring(0, 80)}${question.length > 80 ? "…" : ""}`,
                event_id: scope_id,
              }));
              if (notifications.length > 0) {
                await supabaseAdmin.from("notifications").insert(notifications);
              }
            }
          }
        }
      } catch (notifErr) {
        console.error("Notification error (non-critical):", notifErr);
      }
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
