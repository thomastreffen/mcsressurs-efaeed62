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

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const { case_id, case_item_id } = await req.json();
    if (!case_id) throw new Error("case_id required");

    // Fetch case + items
    const [caseRes, itemsRes] = await Promise.all([
      sb.from("cases").select("*").eq("id", case_id).single(),
      sb.from("case_items").select("*").eq("case_id", case_id).eq("type", "email")
        .order("created_at", { ascending: false }).limit(5),
    ]);

    const caseData = caseRes.data;
    if (!caseData) throw new Error("Case not found");

    // Get specific item if provided
    let targetItem = case_item_id
      ? itemsRes.data?.find((i: any) => i.id === case_item_id)
      : itemsRes.data?.[0];

    // Build context for AI
    const emailContext = targetItem
      ? `Subject: ${targetItem.subject || "(no subject)"}\nFrom: ${targetItem.from_name || targetItem.from_email || "unknown"}\nBody: ${(targetItem.body_text || targetItem.body_preview || "").slice(0, 2000)}`
      : `Case title: ${caseData.title}`;

    // Get potential assignees from case owner/team
    const potentialAssignees: string[] = [];
    if (caseData.owner_user_id) potentialAssignees.push(caseData.owner_user_id);
    if (caseData.assigned_to_user_id && !potentialAssignees.includes(caseData.assigned_to_user_id)) {
      potentialAssignees.push(caseData.assigned_to_user_id);
    }

    // If linked to a job/project, get its technicians
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

    // Use AI to generate suggestion
    let suggestion: any = null;

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
Given an email, extract a task suggestion as JSON with these fields:
- title: concise Norwegian task title (max 80 chars)
- priority: "low", "normal", "high", or "critical"
- due_days: suggested days until due (integer, e.g. 3, 7, 14)
- estimated_minutes: estimated work time in minutes
- rationale: one-sentence Norwegian explanation of why this task is needed
Return ONLY valid JSON, no markdown.`,
              },
              { role: "user", content: emailContext },
            ],
            temperature: 0.3,
            max_tokens: 300,
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const content = aiData.choices?.[0]?.message?.content || "";
          // Parse JSON from response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            suggestion = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (e) {
        console.error("AI suggestion failed, using heuristics:", e);
      }
    }

    // Fallback heuristics
    if (!suggestion) {
      const subject = targetItem?.subject || caseData.title || "Oppfølging";
      suggestion = {
        title: subject.length > 80 ? subject.slice(0, 77) + "..." : subject,
        priority: caseData.priority === "critical" ? "high" : "normal",
        due_days: 7,
        estimated_minutes: 60,
        rationale: "Oppgave basert på innkommende henvendelse",
      };
    }

    // Compute due_at
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + (suggestion.due_days || 7));

    return new Response(
      JSON.stringify({
        title: suggestion.title,
        priority: suggestion.priority || "normal",
        due_at: dueAt.toISOString(),
        estimated_minutes: suggestion.estimated_minutes || 60,
        rationale: suggestion.rationale || "",
        suggested_assignee_ids: potentialAssignees.slice(0, 3),
        ai_confidence: lovableKey ? 0.75 : 0.3,
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
