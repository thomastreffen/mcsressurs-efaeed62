import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REGIME_LABELS: Record<string, string> = {
  nek: "NEK 400 / NEK-serien",
  fel: "Forskrift om elektriske lavspenningsanlegg (FEL)",
  fse: "Forskrift om sikkerhet ved arbeid i og drift av elektriske anlegg (FSE)",
  fsl: "Forskrift om sikkerhet ved arbeid i og drift av elektriske anlegg – lavspent (FSL)",
  annet: "Generelt regelverk / andre forskrifter",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ ok: false, error: "unauthorized", message: "Mangler autorisasjon" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return json({ ok: false, error: "unauthorized", message: "Ugyldig token" }, 401);
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Parse body
    const body = await req.json();
    const { fag_request_id, company_id, regime, question, images = [], context } = body;

    if (!fag_request_id || !company_id || !regime || !question) {
      return json({ ok: false, error: "validation_failed", message: "Mangler påkrevde felter" }, 400);
    }

    // 3. Verify company membership
    const { data: membership } = await serviceClient
      .from("user_memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("company_id", company_id)
      .eq("is_active", true)
      .limit(1);

    const isAdmin = await checkAdmin(serviceClient, user.id);
    if (!isAdmin && (!membership || membership.length === 0)) {
      return json({ ok: false, error: "unauthorized", message: "Ingen tilgang til dette selskapet" }, 403);
    }

    // 4. Verify request belongs to company
    const { data: fagReq } = await serviceClient
      .from("fag_requests")
      .select("id, company_id")
      .eq("id", fag_request_id)
      .single();

    if (!fagReq || fagReq.company_id !== company_id) {
      return json({ ok: false, error: "validation_failed", message: "Forespørselen tilhører ikke dette selskapet" }, 400);
    }

    // 5. Verify image paths are under company_id
    for (const img of images) {
      if (!img.path?.startsWith(`${company_id}/`)) {
        return json({ ok: false, error: "validation_failed", message: "Bildesti utenfor selskapets mappe" }, 400);
      }
    }

    // 6. Set status = analyzing
    await serviceClient
      .from("fag_requests")
      .update({ status: "analyzing", last_activity_at: new Date().toISOString() })
      .eq("id", fag_request_id);

    // 7. Generate signed URLs for images
    const imageContents: Array<{ type: string; image_url: { url: string } }> = [];
    for (const img of images) {
      const { data: signedData, error: signErr } = await serviceClient.storage
        .from("fag-attachments")
        .createSignedUrl(img.path, 300); // 5 min
      if (signErr || !signedData?.signedUrl) {
        console.error("Signed URL error:", signErr);
        continue;
      }
      imageContents.push({
        type: "image_url",
        image_url: { url: signedData.signedUrl },
      });
    }

    // 8. Build AI prompt
    const regimeLabel = REGIME_LABELS[regime] || regime;
    const systemPrompt = `Du er en fagassistent for elektrobransjen i Norge. Du gir teknisk veiledning basert på norske forskrifter og normer.

Ditt ansvarsområde er: ${regimeLabel}

VIKTIG:
- Vær konkret og teknisk presis
- Henvis til spesifikke paragrafer/tabeller der du kan
- Merk alltid usikkerhet tydelig
- Hvis bildet er uklart, si det rett ut
- Svar ALLTID på norsk

Du MÅ svare med gyldig JSON i følgende format:
{
  "summary": "Kort teknisk oppsummering av funn (2-3 setninger)",
  "what_i_see": ["Punktliste over hva du observerer i bildet (hvis bilde er vedlagt)"],
  "assessment": [
    {
      "topic": "Emne/tema",
      "guidance": "Konkret vurdering med henvisning til regelverk",
      "confidence": 72
    }
  ],
  "recommendations": ["Praktiske tiltak og sjekkliste"],
  "risks": ["Hva kan gå galt hvis dette tolkes feil"],
  "followup_questions": ["Spørsmål som må avklares for å gi sikkert svar"],
  "disclaimer": "Kort disclaimer om begrensninger"
}`;

    const userContent: any[] = [
      { type: "text", text: `Regelverk: ${regimeLabel}\n\nSpørsmål: ${question}${context?.notes ? `\n\nEkstra kontekst: ${context.notes}` : ""}${context?.site ? `\nProsjekt/sted: ${context.site}` : ""}` },
      ...imageContents,
    ];

    // 9. Call AI
    const aiResponse = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", errText);
      await serviceClient
        .from("fag_requests")
        .update({ status: "error", last_activity_at: new Date().toISOString() })
        .eq("id", fag_request_id);
      return json({ ok: false, error: "ai_failed", message: "AI-analyse feilet" }, 500);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "{}";
    const usage = aiData.usage;

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error("Failed to parse AI JSON:", rawContent);
      await serviceClient
        .from("fag_requests")
        .update({ status: "error", last_activity_at: new Date().toISOString() })
        .eq("id", fag_request_id);
      return json({ ok: false, error: "ai_failed", message: "Kunne ikke tolke AI-respons" }, 500);
    }

    // 10. Build markdown answer
    const md = buildMarkdown(parsed);

    // Calculate confidence
    const assessments = Array.isArray(parsed.assessment) ? parsed.assessment : [];
    const confidences = assessments.map((a: any) => a.confidence || 0).filter((c: number) => c > 0);
    const avgConfidence = confidences.length > 0 ? Math.round(confidences.reduce((s: number, c: number) => s + c, 0) / confidences.length) : null;

    const followups = Array.isArray(parsed.followup_questions) ? parsed.followup_questions : [];
    const newStatus = followups.length >= 2 ? "needs_followup" : "answered";

    // 11. Save answer
    await serviceClient.from("fag_answers").insert({
      fag_request_id,
      company_id,
      answer_markdown: md,
      model: aiData.model || "google/gemini-2.5-flash",
      tokens_in: usage?.prompt_tokens || null,
      tokens_out: usage?.completion_tokens || null,
    });

    // 12. Update request
    await serviceClient
      .from("fag_requests")
      .update({
        status: newStatus,
        ai_summary: parsed.summary || null,
        ai_confidence: avgConfidence,
        ai_followup_questions: followups,
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", fag_request_id);

    return json({
      ok: true,
      fag_request_id,
      status: newStatus,
      ai_confidence: avgConfidence,
      answer_preview: (parsed.summary || "").substring(0, 200),
    });
  } catch (err: any) {
    console.error("Unexpected error:", err);
    return json({ ok: false, error: "ai_failed", message: err.message || "Ukjent feil" }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function checkAdmin(client: any, userId: string): Promise<boolean> {
  const { data } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "admin" || data?.role === "super_admin";
}

function buildMarkdown(parsed: any): string {
  const sections: string[] = [];

  if (parsed.summary) {
    sections.push(`## Oppsummering\n${parsed.summary}`);
  }

  if (Array.isArray(parsed.what_i_see) && parsed.what_i_see.length > 0) {
    sections.push(`## Observasjoner fra bildet\n${parsed.what_i_see.map((s: string) => `- ${s}`).join("\n")}`);
  }

  if (Array.isArray(parsed.assessment) && parsed.assessment.length > 0) {
    const items = parsed.assessment.map((a: any) =>
      `### ${a.topic} (${a.confidence || "?"}% sikkerhet)\n${a.guidance}`
    ).join("\n\n");
    sections.push(`## Vurdering\n${items}`);
  }

  if (Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
    sections.push(`## Anbefalinger\n${parsed.recommendations.map((r: string) => `- ${r}`).join("\n")}`);
  }

  if (Array.isArray(parsed.risks) && parsed.risks.length > 0) {
    sections.push(`## Risikoer\n${parsed.risks.map((r: string) => `⚠️ ${r}`).join("\n")}`);
  }

  if (Array.isArray(parsed.followup_questions) && parsed.followup_questions.length > 0) {
    sections.push(`## Oppfølgingsspørsmål\n${parsed.followup_questions.map((q: string) => `- ${q}`).join("\n")}`);
  }

  if (parsed.disclaimer) {
    sections.push(`---\n*${parsed.disclaimer}*`);
  }

  return sections.join("\n\n");
}
