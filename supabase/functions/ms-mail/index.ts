import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function ensureValidMsToken(
  supabaseAdmin: any,
  userId: string,
  log: (msg: string) => void
): Promise<string | null> {
  const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !userData?.user) { log(`User fetch failed: ${error?.message}`); return null; }

  const meta = userData.user.user_metadata || {};
  const accessToken = meta.ms_access_token;
  const refreshToken = meta.ms_refresh_token;
  const expiresAt = meta.ms_expires_at;

  if (!accessToken) { log("No MS access token"); return null; }

  if (expiresAt && new Date(expiresAt).getTime() > Date.now() + 5 * 60 * 1000) {
    return accessToken;
  }

  if (!refreshToken) { log("Token expired, no refresh token"); return null; }

  log("Refreshing token...");
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

  if (!tokenRes.ok) { log(`Refresh failed: ${tokenRes.status}`); return null; }

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

  log("Token refreshed");
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
    if (!authHeader?.startsWith("Bearer ")) return respond({ error: "Unauthorized" }, 401);

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
    const { action } = body;
    const logs: string[] = [];
    const log = (msg: string) => {
      logs.push(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);
      console.log(`[ms-mail] ${msg}`);
    };

    log(`Action: ${action}, user: ${authUser.id}`);

    const msToken = await ensureValidMsToken(supabaseAdmin, authUser.id, log);
    if (!msToken) {
      return respond({ error: "Microsoft-tilkobling må fornyes. Logg inn på nytt.", ms_reauth: true, logs }, 401);
    }

    // ─── CREATE DRAFT ───
    if (action === "create_draft") {
      const { entity_type, entity_id, to, cc, bcc, subject, body_html } = body;
      if (!entity_type || !entity_id || !subject) {
        return respond({ error: "Missing required fields", logs }, 400);
      }

      log(`Creating draft for ${entity_type}/${entity_id}`);

      const message: any = {
        subject,
        body: { contentType: "HTML", content: body_html || "" },
        toRecipients: (to || []).map((e: string) => ({ emailAddress: { address: e } })),
        isDraft: true,
      };
      if (cc?.length) message.ccRecipients = cc.map((e: string) => ({ emailAddress: { address: e } }));
      if (bcc?.length) message.bccRecipients = bcc.map((e: string) => ({ emailAddress: { address: e } }));

      const graphRes = await fetch(`${GRAPH_BASE}/me/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${msToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      if (!graphRes.ok) {
        const errText = await graphRes.text();
        log(`Draft creation failed: ${graphRes.status} ${errText.substring(0, 300)}`);
        const ms_reauth = graphRes.status === 401 || graphRes.status === 403;
        return respond({
          error: ms_reauth ? "Mangler rettigheter (Mail.ReadWrite)." : `Graph feil (${graphRes.status})`,
          ms_reauth,
          logs,
        }, 500);
      }

      const draft = await graphRes.json();
      log(`Draft created: ${draft.id?.slice(0, 30)}`);

      // Save to communication_logs
      const logRow = {
        entity_type,
        entity_id,
        direction: "outbound",
        mode: "draft",
        to_recipients: (to || []).map((e: string) => ({ address: e })),
        cc_recipients: (cc || []).map((e: string) => ({ address: e })),
        bcc_recipients: (bcc || []).map((e: string) => ({ address: e })),
        subject,
        body_preview: (body_html || "").replace(/<[^>]*>/g, "").substring(0, 500),
        graph_message_id: draft.id,
        internet_message_id: draft.internetMessageId || null,
        conversation_id: draft.conversationId || null,
        outlook_weblink: draft.webLink || null,
        created_by: authUser.id,
      };

      const { error: insertErr } = await supabaseAdmin.from("communication_logs").insert(logRow);
      if (insertErr) log(`DB insert warning: ${insertErr.message}`);

      // Also log to activity_log / lead_history if lead
      if (entity_type === "lead") {
        await supabaseAdmin.from("lead_history").insert({
          lead_id: entity_id,
          action: "email_draft_created",
          description: `E-postutkast opprettet: ${subject}`,
          performed_by: authUser.id,
          metadata: { message_id: draft.id },
        });
      }
      if (entity_type === "job") {
        await supabaseAdmin.from("event_logs").insert({
          event_id: entity_id,
          action_type: "email_draft_created",
          performed_by: authUser.id,
          change_summary: `E-postutkast opprettet: ${subject}`,
        });
      }

      return respond({
        success: true,
        mode: "draft",
        message_id: draft.id,
        web_link: draft.webLink || `https://outlook.office365.com/mail/drafts/${draft.id}`,
        internet_message_id: draft.internetMessageId || null,
        conversation_id: draft.conversationId || null,
        logs,
      });
    }

    // ─── SEND MAIL (draft-first approach) ───
    if (action === "send_mail") {
      const { entity_type, entity_id, to, cc, bcc, subject, body_html } = body;
      if (!entity_type || !entity_id || !subject || !to?.length) {
        return respond({ error: "Missing required fields", logs }, 400);
      }

      log(`Sending mail for ${entity_type}/${entity_id}`);

      // Step 1: Create draft to get stable IDs
      const message: any = {
        subject,
        body: { contentType: "HTML", content: body_html || "" },
        toRecipients: to.map((e: string) => ({ emailAddress: { address: e } })),
        isDraft: true,
      };
      if (cc?.length) message.ccRecipients = cc.map((e: string) => ({ emailAddress: { address: e } }));
      if (bcc?.length) message.bccRecipients = bcc.map((e: string) => ({ emailAddress: { address: e } }));

      const draftRes = await fetch(`${GRAPH_BASE}/me/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${msToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      if (!draftRes.ok) {
        const errText = await draftRes.text();
        log(`Draft creation failed: ${draftRes.status}`);
        return respond({ error: `Kunne ikke opprette utkast: ${draftRes.status}`, logs }, 500);
      }

      const draft = await draftRes.json();
      log(`Draft created: ${draft.id?.slice(0, 30)}`);

      // Step 2: Send the draft
      const sendRes = await fetch(`${GRAPH_BASE}/me/messages/${draft.id}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${msToken}`, "Content-Length": "0" },
      });

      if (!sendRes.ok) {
        const errText = await sendRes.text();
        log(`Send failed: ${sendRes.status} ${errText.substring(0, 200)}`);
        return respond({
          error: `Sending feilet (${sendRes.status})`,
          draft_id: draft.id,
          web_link: draft.webLink,
          logs,
        }, 500);
      }

      log("Mail sent successfully");

      // Save to communication_logs
      const logRow = {
        entity_type,
        entity_id,
        direction: "outbound",
        mode: "sent",
        to_recipients: to.map((e: string) => ({ address: e })),
        cc_recipients: (cc || []).map((e: string) => ({ address: e })),
        bcc_recipients: (bcc || []).map((e: string) => ({ address: e })),
        subject,
        body_preview: (body_html || "").replace(/<[^>]*>/g, "").substring(0, 500),
        graph_message_id: draft.id,
        internet_message_id: draft.internetMessageId || null,
        conversation_id: draft.conversationId || null,
        outlook_weblink: draft.webLink || null,
        created_by: authUser.id,
      };

      const { error: insertErr } = await supabaseAdmin.from("communication_logs").insert(logRow);
      if (insertErr) log(`DB insert warning: ${insertErr.message}`);

      if (entity_type === "lead") {
        await supabaseAdmin.from("lead_history").insert({
          lead_id: entity_id,
          action: "email_sent",
          description: `E-post sendt: ${subject}`,
          performed_by: authUser.id,
          metadata: { message_id: draft.id, to },
        });
      }
      if (entity_type === "job") {
        await supabaseAdmin.from("event_logs").insert({
          event_id: entity_id,
          action_type: "email_sent",
          performed_by: authUser.id,
          change_summary: `E-post sendt: ${subject} → ${to.join(", ")}`,
        });
      }

      return respond({
        success: true,
        mode: "sent",
        message_id: draft.id,
        internet_message_id: draft.internetMessageId || null,
        conversation_id: draft.conversationId || null,
        web_link: draft.webLink || null,
        logs,
      });
    }

    return respond({ error: `Unknown action: ${action}`, logs }, 400);
  } catch (err) {
    console.error("[ms-mail] Error:", err);
    return respond({ error: String(err) }, 500);
  }
});
