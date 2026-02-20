import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function ensureValidMsToken(
  supabaseAdmin: any,
  userId: string
): Promise<string | null> {
  const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(userId);
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
        scope: "https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/User.Read offline_access",
      }),
    }
  );

  if (!tokenRes.ok) return null;

  const tokenData = await tokenRes.json();
  const newExpires = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      ms_access_token: tokenData.access_token,
      ms_refresh_token: tokenData.refresh_token || refreshToken,
      ms_expires_at: newExpires,
    },
  });

  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: authErr } = await supabaseAnon.auth.getUser(token);
    if (authErr || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authUser.id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { lead_id } = body;

    if (!lead_id) {
      return new Response(JSON.stringify({ error: "Missing lead_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch lead
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!lead.email) {
      return new Response(JSON.stringify({ error: "Lead has no email address" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get MS token for current user
    const msToken = await ensureValidMsToken(supabaseAdmin, userId);
    if (!msToken) {
      return new Response(JSON.stringify({ error: "Microsoft-tilkobling må fornyes. Logg inn på nytt.", ms_reauth: true }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch company settings for email template
    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("company_name, email, phone, website")
      .limit(1)
      .single();

    const companyName = settings?.company_name || "Vårt firma";
    const refCode = lead.lead_ref_code || "";
    const subject = `${refCode} ${lead.company_name}`.trim();

    const htmlBody = `
      <p>Hei ${lead.contact_name || ""},</p>
      <p>Takk for din henvendelse. Vi viser til vår dialog angående ${lead.company_name}.</p>
      <br/>
      <p>Med vennlig hilsen,</p>
      <p><strong>${companyName}</strong></p>
      ${settings?.phone ? `<p>Tlf: ${settings.phone}</p>` : ""}
      ${settings?.email ? `<p>E-post: ${settings.email}</p>` : ""}
      ${settings?.website ? `<p>Web: ${settings.website}</p>` : ""}
      <br/>
      <p style="font-size:11px;color:#888;">Ref: ${refCode}</p>
    `;

    // Create draft via Graph API
    const graphRes = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${msToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject,
        body: { contentType: "HTML", content: htmlBody },
        toRecipients: [
          { emailAddress: { address: lead.email, name: lead.contact_name || lead.company_name } },
        ],
        isDraft: true,
      }),
    });

    if (!graphRes.ok) {
      const errText = await graphRes.text();
      console.error("[create-lead-email-draft] Graph error:", graphRes.status, errText);
      const ms_reauth = graphRes.status === 401 || graphRes.status === 403;
      return new Response(JSON.stringify({
        error: ms_reauth
          ? "Microsoft-tilkobling mangler rettigheter (Mail.ReadWrite). Logg inn på nytt for å gi tilgang."
          : `Graph API feil (${graphRes.status}): ${errText}`,
        ms_reauth,
        graph_status: graphRes.status,
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const draft = await graphRes.json();

    // Build web link to open draft in Outlook
    const webLink = draft.webLink || `https://outlook.office365.com/mail/drafts/${draft.id}`;

    // Log in history
    await supabaseAdmin.from("lead_history").insert({
      lead_id,
      action: "email_draft_created",
      description: `E-postutkast opprettet til ${lead.email}`,
      performed_by: userId,
      metadata: { message_id: draft.id, subject },
    });

    return new Response(JSON.stringify({
      success: true,
      message_id: draft.id,
      web_link: webLink,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[create-lead-email-draft] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
