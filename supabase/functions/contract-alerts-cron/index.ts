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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const today = new Date().toISOString().split("T")[0];
    let alertsCreated = 0;
    let jobsUpdated = 0;

    // 1. Find open deadlines where today matches a notification day
    const { data: deadlines, error: dlErr } = await supabaseAdmin
      .from("contract_deadlines")
      .select("*, contracts(company_id, job_id, title, risk_level)")
      .eq("status", "open");

    if (dlErr) throw dlErr;

    for (const dl of deadlines || []) {
      const dueDate = new Date(dl.due_date);
      const daysUntil = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const notifyDays: number[] = dl.notify_days_before || [30, 14, 7, 2, 0];

      if (!notifyDays.includes(daysUntil)) continue;

      // Check if alert already exists for this deadline + date combo
      const { count } = await supabaseAdmin
        .from("contract_alerts")
        .select("id", { count: "exact", head: true })
        .eq("contract_id", dl.contract_id)
        .eq("alert_type", "deadline_upcoming")
        .eq("due_date", dl.due_date)
        .gte("created_at", today + "T00:00:00Z");

      if (count && count > 0) continue;

      const severity = daysUntil <= 2 ? "critical" : daysUntil <= 7 ? "warn" : "info";
      const contract = dl.contracts as any;

      await supabaseAdmin.from("contract_alerts").insert({
        company_id: dl.company_id,
        contract_id: dl.contract_id,
        job_id: contract?.job_id || dl.job_id,
        alert_type: "deadline_upcoming",
        severity,
        title: daysUntil === 0
          ? `FRIST I DAG: ${dl.title}`
          : `Frist om ${daysUntil} dager: ${dl.title}`,
        message: `Kontrakt "${contract?.title || "Ukjent"}": ${dl.title} forfaller ${dl.due_date}.`,
        due_date: dl.due_date,
        target_user_id: dl.owner_user_id,
      });
      alertsCreated++;

      // Mark overdue deadlines
      if (daysUntil < 0) {
        await supabaseAdmin
          .from("contract_deadlines")
          .update({ status: "overdue" })
          .eq("id", dl.id);
      }
    }

    // 2. Update job snapshot fields for all contracts with jobs
    const { data: contracts } = await supabaseAdmin
      .from("contracts")
      .select("id, job_id, risk_level")
      .not("job_id", "is", null);

    for (const c of contracts || []) {
      const { data: nextDl } = await supabaseAdmin
        .from("contract_deadlines")
        .select("due_date")
        .eq("contract_id", c.id)
        .eq("status", "open")
        .order("due_date", { ascending: true })
        .limit(1);

      const { count: alertCount } = await supabaseAdmin
        .from("contract_alerts")
        .select("id", { count: "exact", head: true })
        .eq("contract_id", c.id)
        .eq("is_read", false);

      await supabaseAdmin.from("events").update({
        contract_risk_level: c.risk_level || "green",
        next_contract_deadline: nextDl?.[0]?.due_date || null,
        contract_alert_count: alertCount || 0,
      }).eq("id", c.job_id);
      jobsUpdated++;
    }

    return new Response(
      JSON.stringify({ ok: true, alerts_created: alertsCreated, jobs_updated: jobsUpdated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("contract-alerts-cron error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
