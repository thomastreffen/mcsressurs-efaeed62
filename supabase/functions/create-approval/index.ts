import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = "https://mcsressurs.lovable.app";

async function getValidMsToken(supabaseAdmin: any, userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (!data?.user) return null;

  const meta = data.user.user_metadata || {};
  if (!meta.ms_access_token) return null;

  const isExpired = meta.ms_expires_at ? new Date(meta.ms_expires_at) <= new Date() : false;

  if (!isExpired) return meta.ms_access_token;

  // Refresh token
  if (!meta.ms_refresh_token) return null;

  const clientId = Deno.env.get("AZURE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET")!;
  const tenantId = Deno.env.get("AZURE_TENANT_ID")!;

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: meta.ms_refresh_token,
        grant_type: "refresh_token",
        scope: "openid profile email User.Read Mail.Send offline_access",
      }),
    }
  );

  if (!tokenRes.ok) {
    console.error("[create-approval] Token refresh failed:", await tokenRes.text());
    return null;
  }

  const newTokens = await tokenRes.json();
  const newExpiresAt = new Date(Date.now() + (newTokens.expires_in || 3600) * 1000).toISOString();

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      ms_access_token: newTokens.access_token,
      ms_refresh_token: newTokens.refresh_token || meta.ms_refresh_token,
      ms_expires_at: newExpiresAt,
    },
  });

  return newTokens.access_token;
}

function buildApprovalEmail(
  job: any,
  techName: string,
  token: string,
  displayNumber: string
): { subject: string; body: string } {
  const startDate = new Date(job.start_time).toLocaleDateString("nb-NO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const startTime = new Date(job.start_time).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  const endTime = new Date(job.end_time).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });

  const approveUrl = `${APP_URL}/approval/${token}?action=approve`;
  const rescheduleUrl = `${APP_URL}/approval/${token}?action=reschedule`;
  const rejectUrl = `${APP_URL}/approval/${token}?action=reject`;

  const subject = `Jobbforespørsel: ${displayNumber} – ${job.title}`;

  const body = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a2e;">
  <div style="background: #2563b0; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 18px;">MCS Service – Jobbforespørsel</h1>
  </div>
  <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
    <p>Hei ${techName},</p>
    <p>Du har blitt tildelt en ny jobb. Vennligst bekreft om du kan ta oppdraget.</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 8px 0; color: #64748b; width: 120px;">Jobbnummer</td><td style="padding: 8px 0; font-weight: 600;">${displayNumber}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Tittel</td><td style="padding: 8px 0;">${job.title}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Kunde</td><td style="padding: 8px 0;">${job.customer || "—"}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Adresse</td><td style="padding: 8px 0;">${job.address || "—"}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Dato</td><td style="padding: 8px 0;">${startDate}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Tid</td><td style="padding: 8px 0;">${startTime} – ${endTime}</td></tr>
    </table>
    
    <div style="margin: 24px 0; text-align: center;">
      <a href="${approveUrl}" style="display: inline-block; background: #22c55e; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 4px;">✓ Godkjenn</a>
      <a href="${rescheduleUrl}" style="display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 4px;">⏰ Foreslå nytt tidspunkt</a>
      <a href="${rejectUrl}" style="display: inline-block; background: #ef4444; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 4px;">✕ Avslå</a>
    </div>
    
    <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">Denne lenken er gyldig i 48 timer. Du trenger ikke å logge inn for å svare.</p>
  </div>
</body>
</html>`;

  return { subject, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Validate caller
    const jwt = authHeader.replace("Bearer ", "");
    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerUserId = userData.user.id;

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .single();

    if (!roleData || (roleData.role !== "admin" && roleData.role !== "super_admin")) {
      return new Response(JSON.stringify({ error: "Forbidden - admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "Missing job_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch job
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("events")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch technicians assigned to this job
    const { data: assignments } = await supabaseAdmin
      .from("event_technicians")
      .select("technician_id")
      .eq("event_id", job_id);

    if (!assignments || assignments.length === 0) {
      return new Response(JSON.stringify({ error: "No technicians assigned to this job" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get technician details
    const techIds = assignments.map((a: any) => a.technician_id);
    const { data: technicians } = await supabaseAdmin
      .from("technicians")
      .select("id, name, email, user_id")
      .in("id", techIds);

    if (!technicians || technicians.length === 0) {
      return new Response(JSON.stringify({ error: "Technician records not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const displayNumber = job.job_number || job.internal_number || "—";

    // Get MS token from caller for sending emails
    const msToken = await getValidMsToken(supabaseAdmin, callerUserId);
    if (!msToken) {
      console.error("[create-approval] No valid MS token for caller:", callerUserId);
    }

    const results: any[] = [];

    for (const tech of technicians) {
      // Create approval record
      const { data: approval, error: approvalErr } = await supabaseAdmin
        .from("job_approvals")
        .insert({
          job_id: job_id,
          technician_user_id: tech.user_id,
        })
        .select("token")
        .single();

      if (approvalErr) {
        console.error("[create-approval] Insert error for tech:", tech.id, approvalErr);
        results.push({ techId: tech.id, error: approvalErr.message });
        continue;
      }

      // Send email via Microsoft Graph
      if (msToken && tech.email) {
        const { subject, body } = buildApprovalEmail(job, tech.name, approval.token, displayNumber);

        try {
          const emailRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${msToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                subject,
                body: { contentType: "HTML", content: body },
                toRecipients: [{ emailAddress: { address: tech.email } }],
              },
            }),
          });

          if (!emailRes.ok) {
            const errText = await emailRes.text();
            console.error("[create-approval] Email send failed for:", tech.email, errText);
            results.push({ techId: tech.id, token: approval.token, emailSent: false, error: errText });
          } else {
            console.log("[create-approval] Email sent to:", tech.email);
            results.push({ techId: tech.id, token: approval.token, emailSent: true });
          }
        } catch (emailErr) {
          console.error("[create-approval] Email exception:", emailErr);
          results.push({ techId: tech.id, token: approval.token, emailSent: false });
        }
      } else {
        results.push({ techId: tech.id, token: approval.token, emailSent: false, reason: "No MS token or no email" });
      }

      // Log to event_logs
      await supabaseAdmin.from("event_logs").insert({
        event_id: job_id,
        performed_by: callerUserId,
        action_type: "created",
        change_summary: `Godkjenningsforespørsel sendt til ${tech.name}`,
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[create-approval] Exception:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
