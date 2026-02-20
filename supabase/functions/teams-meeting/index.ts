import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function ensureValidMsToken(
  supabaseAdmin: any,
  userId: string
): Promise<string | null> {
  const { data: userData, error } =
    await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !userData?.user) return null;

  const meta = userData.user.user_metadata || {};
  const accessToken = meta.ms_access_token;
  const refreshToken = meta.ms_refresh_token;
  const expiresAt = meta.ms_expires_at;

  if (!accessToken) return null;

  if (expiresAt && new Date(expiresAt).getTime() > Date.now() + 5 * 60 * 1000) {
    return accessToken;
  }

  if (!refreshToken) return null;

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${Deno.env.get("AZURE_TENANT_ID")}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("AZURE_CLIENT_ID")!,
        client_secret: Deno.env.get("AZURE_CLIENT_SECRET")!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "https://graph.microsoft.com/.default offline_access",
      }),
    }
  );

  if (!tokenRes.ok) return null;

  const tokenData = await tokenRes.json();
  const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      ms_access_token: tokenData.access_token,
      ms_refresh_token: tokenData.refresh_token || refreshToken,
      ms_expires_at: newExpiry,
    },
  });

  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const respond = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const jwt = authHeader.replace("Bearer ", "");
    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: authUser }, error: userErr } = await supabaseAnon.auth.getUser(jwt);
    if (userErr || !authUser) return respond({ error: "Invalid session" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json().catch(() => ({}));
    const { action, job_id } = body;

    if (!job_id) return respond({ error: "Missing job_id" }, 400);

    // Verify user can access the job (RLS will filter via anon client)
    const { data: job, error: jobErr } = await supabaseAnon
      .from("events")
      .select("id, title, customer, start_time, end_time, internal_number, job_number, meeting_join_url, meeting_id")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) return respond({ error: "Job not found or access denied" }, 404);

    if (action === "create") {
      if (job.meeting_join_url) {
        return respond({ error: "Møte eksisterer allerede", existing: true }, 409);
      }

      const msToken = await ensureValidMsToken(supabaseAdmin, authUser.id);
      if (!msToken) {
        return respond({ error: "Ingen gyldig Microsoft-tilkobling", ms_reauth: true }, 400);
      }

      const displayNumber = job.internal_number || job.job_number || job.id.slice(0, 8);
      const subject = `JOBB ${displayNumber} | ${job.customer || "Ukjent kunde"} | ${job.title}`;

      // Use job times if available, else 30 min from now
      let startDateTime = job.start_time;
      let endDateTime = job.end_time;
      if (!startDateTime || !endDateTime) {
        const now = new Date();
        startDateTime = now.toISOString();
        endDateTime = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
      }

      const meetingPayload = {
        subject,
        startDateTime: { dateTime: startDateTime, timeZone: "Europe/Oslo" },
        endDateTime: { dateTime: endDateTime, timeZone: "Europe/Oslo" },
      };

      const graphRes = await fetch(`${GRAPH_BASE}/me/onlineMeetings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${msToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(meetingPayload),
      });

      if (!graphRes.ok) {
        const errText = await graphRes.text();
        console.error("[teams-meeting] Graph error:", graphRes.status, errText.substring(0, 300));
        
        if (graphRes.status === 401) {
          return respond({ error: "Token utløpt, logg inn på nytt", ms_reauth: true }, 401);
        }
        if (graphRes.status === 403) {
          return respond({ error: "Mangler rettigheter for OnlineMeetings. Krever OnlineMeetings.ReadWrite scope.", ms_reauth: true }, 403);
        }
        return respond({ error: "Kunne ikke opprette Teams-møte", details: errText.substring(0, 200) }, 500);
      }

      const meetingData = await graphRes.json();
      const joinUrl = meetingData.joinWebUrl || meetingData.joinUrl;
      const meetingId = meetingData.id;

      // Save to DB via admin (RLS allows admin updates, but use admin for safety)
      await supabaseAdmin.from("events").update({
        meeting_join_url: joinUrl,
        meeting_id: meetingId,
        meeting_created_at: new Date().toISOString(),
        meeting_created_by: authUser.id,
      }).eq("id", job_id);

      // Log in event_logs
      await supabaseAdmin.from("event_logs").insert({
        event_id: job_id,
        action_type: "teams_meeting_created",
        performed_by: authUser.id,
        change_summary: `Teams-møte opprettet: ${subject}`,
      });

      return respond({
        success: true,
        meeting: {
          join_url: joinUrl,
          meeting_id: meetingId,
          created_at: new Date().toISOString(),
        },
      });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[teams-meeting] Exception:", err);
    return respond({ error: "Internal server error", details: String(err) }, 500);
  }
});
