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
  meta: any
): Promise<string | null> {
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

  if (!tokenRes.ok) {
    await tokenRes.text();
    return null;
  }

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

async function fetchMailboxMessages(
  msToken: string,
  mailboxAddress: string,
  sinceDate: string,
  isShared: boolean
): Promise<any[]> {
  const filter = `receivedDateTime ge ${sinceDate}`;
  // For shared mailboxes use /users/{email}/messages, for personal use /me/messages
  const basePath = isShared
    ? `${GRAPH_BASE}/users/${encodeURIComponent(mailboxAddress)}/messages`
    : `${GRAPH_BASE}/me/messages`;
  const url = `${basePath}?$filter=${encodeURIComponent(filter)}&$top=50&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,body,from,receivedDateTime,hasAttachments,isDraft`;

  const graphRes = await fetch(url, {
    headers: { Authorization: `Bearer ${msToken}` },
  });

  if (!graphRes.ok) {
    const errText = await graphRes.text();
    console.error(`[inbox-sync] Graph error for ${mailboxAddress}: ${graphRes.status} ${errText.substring(0, 200)}`);
    return [];
  }

  const graphData = await graphRes.json();
  return (graphData.value || []).filter((m: any) => !m.isDraft);
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
    // Auth check
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
    const { data: claimsData, error: claimsErr } = await supabaseAnon.auth.getClaims(jwt);
    if (claimsErr || !claimsData?.claims) {
      return respond({ error: "Invalid session" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get user metadata for MS token
    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userErr || !userData?.user) {
      return respond({ error: "User not found" }, 404);
    }

    const meta = userData.user.user_metadata || {};
    const msToken = await ensureValidMsToken(supabaseAdmin, userId, meta);
    if (!msToken) {
      return respond({ error: "Microsoft-tilkobling mangler. Koble til via Integrasjoner.", ms_reauth: true }, 401);
    }

    // Fetch enabled mailboxes
    const { data: mailboxes } = await supabaseAdmin
      .from("mailboxes")
      .select("address, display_name")
      .eq("is_enabled", true);

    const enabledMailboxes = mailboxes || [];
    
    console.log(`[inbox-sync] Syncing ${enabledMailboxes.length} shared mailbox(es) for user ${userId}`);

    const sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let totalFetched = 0;
    let totalNew = 0;
    let totalSkipped = 0;

    for (const mb of enabledMailboxes) {
      console.log(`[inbox-sync] Fetching from shared mailbox: ${mb.address}`);
      const messages = await fetchMailboxMessages(msToken, mb.address, sinceDate, true);
      console.log(`[inbox-sync] Got ${messages.length} messages from ${mb.address}`);
      totalFetched += messages.length;

      for (const msg of messages) {
        const { error: upsertErr } = await supabaseAdmin
          .from("inbox_messages")
          .upsert(
            {
              external_id: msg.id,
              subject: msg.subject || "(Ingen emne)",
              from_name: msg.from?.emailAddress?.name || null,
              from_email: msg.from?.emailAddress?.address || null,
              received_at: msg.receivedDateTime || new Date().toISOString(),
              body_preview: (msg.bodyPreview || "").substring(0, 500),
              body_full: msg.body?.content || null,
              has_attachments: msg.hasAttachments || false,
              fetched_by: userId,
              status: "new",
              mailbox_address: mb.address,
              visibility: "team",
            },
            { onConflict: "external_id", ignoreDuplicates: true }
          );

        if (upsertErr) {
          console.log(`[inbox-sync] Upsert error: ${upsertErr.message}`);
          totalSkipped++;
        } else {
          totalNew++;
        }
      }
    }

    // If no shared mailboxes configured, fall back to personal inbox (legacy)
    if (enabledMailboxes.length === 0) {
      console.log(`[inbox-sync] No shared mailboxes enabled. Fetching personal inbox as fallback.`);
      const messages = await fetchMailboxMessages(msToken, "", sinceDate, false);
      totalFetched = messages.length;
      console.log(`[inbox-sync] Got ${messages.length} messages from personal inbox`);

      for (const msg of messages) {
        const { error: upsertErr } = await supabaseAdmin
          .from("inbox_messages")
          .upsert(
            {
              external_id: msg.id,
              subject: msg.subject || "(Ingen emne)",
              from_name: msg.from?.emailAddress?.name || null,
              from_email: msg.from?.emailAddress?.address || null,
              received_at: msg.receivedDateTime || new Date().toISOString(),
              body_preview: (msg.bodyPreview || "").substring(0, 500),
              body_full: msg.body?.content || null,
              has_attachments: msg.hasAttachments || false,
              fetched_by: userId,
              status: "new",
              mailbox_address: "personal",
              visibility: "team",
            },
            { onConflict: "external_id", ignoreDuplicates: true }
          );

        if (upsertErr) {
          totalSkipped++;
        } else {
          totalNew++;
        }
      }
    }

    console.log(`[inbox-sync] Done. Fetched: ${totalFetched}, New: ${totalNew}, Skipped: ${totalSkipped}`);

    return respond({
      success: true,
      fetched: totalFetched,
      new_messages: totalNew,
      skipped: totalSkipped,
      mailboxes_synced: enabledMailboxes.length || 1,
    });
  } catch (err) {
    console.error("[inbox-sync] Fatal error:", err);
    return respond({ error: String(err) }, 500);
  }
});
