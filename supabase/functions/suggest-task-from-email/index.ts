import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const sb = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const { case_id, case_item_id } = await req.json();
    if (!case_id) throw new Error("case_id required");

    // Fetch case + items + documents in parallel
    const [caseRes, itemsRes, docsRes] = await Promise.all([
      sb.from("cases").select("*").eq("id", case_id).single(),
      sb.from("case_items").select("*").eq("case_id", case_id).eq("type", "email")
        .order("created_at", { ascending: false }).limit(5),
      sb.from("documents").select("id, file_name, ai_category, ai_confidence")
        .eq("entity_id", case_id).is("deleted_at", null).limit(20),
    ]);

    const caseData = caseRes.data;
    if (!caseData) throw new Error("Case not found");

    const targetItem = case_item_id
      ? itemsRes.data?.find((i: any) => i.id === case_item_id)
      : itemsRes.data?.[0];

    const emailContext = targetItem
      ? `Subject: ${targetItem.subject || "(no subject)"}\nFrom: ${targetItem.from_name || targetItem.from_email || "unknown"}\nBody: ${(targetItem.body_text || targetItem.body_preview || "").slice(0, 2000)}`
      : `Case title: ${caseData.title}`;

    // Attachment categories for heuristics
    const attachmentCategories = (docsRes.data || []).map((d: any) => d.ai_category).filter(Boolean);
    const docIds = (docsRes.data || []).map((d: any) => d.id);

    // Get potential assignees
    const potentialAssignees: string[] = [];
    if (caseData.owner_user_id) potentialAssignees.push(caseData.owner_user_id);
    if (caseData.assigned_to_user_id && !potentialAssignees.includes(caseData.assigned_to_user_id)) {
      potentialAssignees.push(caseData.assigned_to_user_id);
    }

    const linkedId = caseData.linked_work_order_id || caseData.linked_project_id;
    if (linkedId) {
      const { data: techs } = await sb.from("event_technicians")
        .select("technician_id, technicians(user_id)")
        .eq("event_id", linkedId);
      if (techs) {
        for (const t of techs) {
          const uid = (t as any).technicians?.user_id;
          if (uid && !potentialAssignees.includes(uid)) potentialAssignees.push(uid);
        }
      }
    }

    // --- Build suggested_actions using AI + heuristics ---
    let aiSuggestion: any = null;
    let aiActions: any[] = [];

    if (lovableKey) {
      try {
        const aiRes = await fetch("https://api.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              {
                role: "system",
                content: `You are a task extraction assistant for a Norwegian construction/service company.
Given an email and its attachment categories, suggest 2-4 actionable tasks as JSON.
Return a JSON object with:
- primary: { title, priority, due_days, estimated_minutes, rationale }
- actions: array of { action_type, title, priority, due_days, estimated_minutes, rationale }

action_type must be one of: service, clarification, assign_to_techs, offer_followup, fdv, contract_review, drawing_review

Attachment categories present: ${attachmentCategories.join(", ") || "none"}

Return ONLY valid JSON, no markdown.`,
              },
              { role: "user", content: emailContext },
            ],
            temperature: 0.3,
            max_tokens: 600,
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const content = aiData.choices?.[0]?.message?.content || "";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            aiSuggestion = parsed.primary || parsed;
            aiActions = parsed.actions || [];
          }
        }
      } catch (e) {
        console.error("AI suggestion failed, using heuristics:", e);
      }
    }

    // Heuristic fallback actions
    if (aiActions.length === 0) {
      const subject = (targetItem?.subject || caseData.title || "").toLowerCase();
      const bodyLower = (targetItem?.body_text || targetItem?.body_preview || "").toLowerCase();
      const combined = subject + " " + bodyLower;

      // Always suggest a basic service task
      aiActions.push({
        action_type: "service",
        title: targetItem?.subject || caseData.title || "Serviceoppgave",
        priority: "normal",
        due_days: 7,
        estimated_minutes: 60,
        rationale: "Opprett serviceoppgave basert på henvendelsen",
      });

      // Heuristic: FDV attachments
      if (attachmentCategories.includes("fdv")) {
        aiActions.push({
          action_type: "fdv",
          title: "FDV-dokumentasjon gjennomgang",
          priority: "normal",
          due_days: 14,
          estimated_minutes: 120,
          rationale: "Vedlagt FDV-dokumentasjon krever gjennomgang",
        });
      }

      // Heuristic: Contract attachments
      if (attachmentCategories.includes("contract")) {
        aiActions.push({
          action_type: "contract_review",
          title: "Kontraktsgjennomgang",
          priority: "high",
          due_days: 5,
          estimated_minutes: 90,
          rationale: "Vedlagt kontrakt krever gjennomgang",
        });
      }

      // Heuristic: urgent keywords
      if (combined.includes("haster") || combined.includes("asap") || combined.includes("frist")) {
        aiActions[0].priority = "high";
        aiActions[0].due_days = 2;
      }

      // Heuristic: offer keywords
      if (combined.includes("tilbud") || combined.includes("pris")) {
        aiActions.push({
          action_type: "offer_followup",
          title: "Tilbudsoppfølging",
          priority: "normal",
          due_days: 5,
          estimated_minutes: 45,
          rationale: "E-post inneholder referanse til tilbud/pris",
        });
      }

      // Heuristic: critical
      if (combined.includes("feil") || combined.includes("stans") || combined.includes("kritisk")) {
        aiActions[0].priority = "critical";
        aiActions[0].due_days = 1;
        aiActions[0].estimated_minutes = 30;
      }

      // Drawing
      if (attachmentCategories.includes("drawing")) {
        aiActions.push({
          action_type: "drawing_review",
          title: "Gjennomgå tegninger",
          priority: "normal",
          due_days: 7,
          estimated_minutes: 60,
          rationale: "Vedlagte tegninger bør gjennomgås",
        });
      }
    }

    // Build primary suggestion
    if (!aiSuggestion) {
      const primary = aiActions[0] || {};
      aiSuggestion = {
        title: primary.title || targetItem?.subject || caseData.title || "Oppfølging",
        priority: primary.priority || "normal",
        due_days: primary.due_days || 7,
        estimated_minutes: primary.estimated_minutes || 60,
        rationale: primary.rationale || "Oppgave basert på innkommende henvendelse",
      };
    }

    // Compute due_at for primary and actions
    const now = new Date();
    const computeDue = (days: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + (days || 7));
      return d.toISOString();
    };

    const suggestedActions = aiActions.slice(0, 4).map((a: any) => ({
      action_type: a.action_type,
      title: (a.title || "").slice(0, 80),
      priority: a.priority || "normal",
      due_at: computeDue(a.due_days || 7),
      estimated_minutes: a.estimated_minutes || 60,
      rationale: a.rationale || "",
      suggested_assignee_ids: potentialAssignees.slice(0, 3),
      suggested_attachment_document_ids: docIds.slice(0, 5),
    }));

    return new Response(
      JSON.stringify({
        title: (aiSuggestion.title || "").slice(0, 80),
        priority: aiSuggestion.priority || "normal",
        due_at: computeDue(aiSuggestion.due_days || 7),
        estimated_minutes: aiSuggestion.estimated_minutes || 60,
        rationale: aiSuggestion.rationale || "",
        suggested_assignee_ids: potentialAssignees.slice(0, 3),
        ai_confidence: lovableKey ? 0.75 : 0.3,
        suggested_actions: suggestedActions,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
