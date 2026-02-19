import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Determine overall job status based on all approval statuses.
 * Rules:
 * - If any rejected → 'rejected'
 * - If any reschedule_requested → 'time_change_proposed'
 * - If all approved → 'approved'
 * - Otherwise → 'requested' (still pending)
 */
function computeJobStatus(approvals: any[]): string {
  if (approvals.some((a: any) => a.status === "rejected")) return "rejected";
  if (approvals.some((a: any) => a.status === "reschedule_requested")) return "time_change_proposed";
  if (approvals.every((a: any) => a.status === "approved")) return "approved";
  return "requested";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // This is a PUBLIC endpoint - no auth required
    const { token, action, comment, proposed_start, proposed_end } = await req.json();

    if (!token || !action) {
      return new Response(JSON.stringify({ error: "Missing token or action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["approve", "reject", "reschedule"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch approval by token
    const { data: approval, error: fetchErr } = await supabaseAdmin
      .from("job_approvals")
      .select("*")
      .eq("token", token)
      .single();

    if (fetchErr || !approval) {
      return new Response(JSON.stringify({ error: "Ugyldig token" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate token state
    if (approval.status !== "pending") {
      return new Response(JSON.stringify({ error: "Denne forespørselen er allerede besvart" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(approval.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Denne lenken har utløpt" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get technician name for logging
    const { data: tech } = await supabaseAdmin
      .from("technicians")
      .select("name")
      .eq("user_id", approval.technician_user_id)
      .single();

    const techName = tech?.name || "Ukjent montør";

    // Update approval based on action
    let approvalStatus: string;
    let logMessage: string;
    const updateData: any = {
      responded_at: new Date().toISOString(),
    };

    if (action === "approve") {
      approvalStatus = "approved";
      logMessage = `Montør ${techName} godkjente jobben`;
    } else if (action === "reject") {
      if (!comment) {
        return new Response(JSON.stringify({ error: "Begrunnelse er påkrevd ved avslag" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      approvalStatus = "rejected";
      updateData.comment = comment;
      logMessage = `Montør ${techName} avslo jobben (begrunnelse: ${comment})`;
    } else {
      // reschedule
      if (!proposed_start || !proposed_end) {
        return new Response(JSON.stringify({ error: "Foreslått start og slutt er påkrevd" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      approvalStatus = "reschedule_requested";
      updateData.proposed_start = proposed_start;
      updateData.proposed_end = proposed_end;
      if (comment) updateData.comment = comment;
      logMessage = `Montør ${techName} foreslo nytt tidspunkt`;
    }

    updateData.status = approvalStatus;

    const { error: updateErr } = await supabaseAdmin
      .from("job_approvals")
      .update(updateData)
      .eq("id", approval.id);

    if (updateErr) {
      console.error("[handle-approval] Update error:", updateErr);
      return new Response(JSON.stringify({ error: "Kunne ikke oppdatere svar" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Re-fetch all approvals for this job to compute overall status
    const { data: allApprovals } = await supabaseAdmin
      .from("job_approvals")
      .select("status")
      .eq("job_id", approval.job_id);

    const newJobStatus = computeJobStatus(allApprovals || []);

    // Update job status
    const jobUpdate: any = { status: newJobStatus };
    if (approvalStatus === "reschedule_requested" && proposed_start && proposed_end) {
      jobUpdate.proposed_start = proposed_start;
      jobUpdate.proposed_end = proposed_end;
    }

    await supabaseAdmin
      .from("events")
      .update(jobUpdate)
      .eq("id", approval.job_id);

    // Log to event_logs
    await supabaseAdmin.from("event_logs").insert({
      event_id: approval.job_id,
      performed_by: approval.technician_user_id,
      action_type: "status_changed",
      change_summary: logMessage,
    });

    return new Response(JSON.stringify({
      success: true,
      message: action === "approve" ? "Jobben er godkjent!" :
               action === "reject" ? "Jobben er avslått." :
               "Nytt tidspunkt er foreslått.",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[handle-approval] Exception:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
