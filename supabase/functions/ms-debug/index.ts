import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: authUser }, error: userErr } = await supabaseAnon.auth.getUser(token);
    if (userErr || !authUser) {
      return new Response(
        JSON.stringify({ error: "Invalid session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authUser.id;
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get fresh metadata via admin
    const { data: { user: adminUser }, error: adminErr } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (adminErr || !adminUser) {
      return new Response(
        JSON.stringify({ error: "Could not fetch user data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const meta = adminUser.user_metadata || {};
    const body = await req.json().catch(() => ({}));
    const action = body.action || "status";

    const logs: string[] = [];
    const log = (msg: string) => {
      const ts = new Date().toISOString().slice(11, 23);
      logs.push(`[${ts}] ${msg}`);
      console.log(`[ms-debug] ${msg}`);
    };

    log(`Action: ${action}, User: ${userId}, Email: ${authUser.email}`);

    // Token status
    const hasAccessToken = !!meta.ms_access_token;
    const hasRefreshToken = !!meta.ms_refresh_token;
    const expiresAt = meta.ms_expires_at || null;
    const isExpired = expiresAt ? new Date(expiresAt) < new Date() : true;
    const tenantId = Deno.env.get("AZURE_TENANT_ID") || "unknown";

    log(`Token present: ${hasAccessToken}, Refresh present: ${hasRefreshToken}`);
    log(`Expires at: ${expiresAt || "N/A"}, Expired: ${isExpired}`);
    log(`Microsoft ID: ${meta.microsoft_id || "N/A"}`);

    const expectedScopes = "openid profile email User.Read Calendars.ReadWrite User.Read.All Mail.ReadWrite offline_access";

    if (action === "status") {
      return new Response(
        JSON.stringify({
          user_id: userId,
          email: authUser.email,
          ms_connected: hasAccessToken,
          ms_refresh_available: hasRefreshToken,
          ms_expires_at: expiresAt,
          ms_expired: isExpired,
          ms_microsoft_id: meta.microsoft_id || null,
          expected_scopes: expectedScopes,
          tenant_id: tenantId,
          logs,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "test") {
      let accessToken = meta.ms_access_token;

      // If expired, try refresh
      if (isExpired && hasRefreshToken) {
        log("Token expired, attempting refresh...");
        const clientId = Deno.env.get("AZURE_CLIENT_ID")!;
        const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET")!;

        const refreshRes = await fetch(
          `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: meta.ms_refresh_token,
              grant_type: "refresh_token",
              scope: expectedScopes,
            }),
          }
        );

        if (!refreshRes.ok) {
          const errText = await refreshRes.text();
          log(`Refresh FAILED: HTTP ${refreshRes.status}`);
          log(`Error: ${errText.substring(0, 300)}`);

          // Parse for actionable advice
          if (errText.includes("AADSTS700082")) {
            log("ANBEFALING: Refresh token er utløpt. Brukeren må logge inn på nytt.");
          } else if (errText.includes("AADSTS50076")) {
            log("ANBEFALING: MFA kreves. Brukeren må logge inn på nytt med MFA.");
          } else if (errText.includes("invalid_client")) {
            log("ANBEFALING: Client secret er ugyldig eller utløpt. Sjekk Entra App Registration.");
          }

          return new Response(
            JSON.stringify({
              refresh_attempted: true,
              refresh_success: false,
              error: "Token refresh failed",
              tests: {},
              logs,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const newTokens = await refreshRes.json();
        accessToken = newTokens.access_token;
        const newExpiry = new Date(Date.now() + (newTokens.expires_in || 3600) * 1000).toISOString();

        log(`Refresh SUCCESS. New expiry: ${newExpiry}`);

        // Save updated tokens
        const existingMeta = adminUser.user_metadata || {};
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...existingMeta,
            ms_access_token: newTokens.access_token,
            ms_refresh_token: newTokens.refresh_token || existingMeta.ms_refresh_token,
            ms_expires_at: newExpiry,
          },
        });
        log("Tokens updated in user_metadata.");
      } else if (isExpired && !hasRefreshToken) {
        log("Token expired and NO refresh token available. User must re-login.");
        return new Response(
          JSON.stringify({
            error: "Token expired, no refresh token",
            ms_reauth: true,
            tests: {},
            logs,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!accessToken) {
        log("No access token available.");
        return new Response(
          JSON.stringify({ error: "No access token", ms_reauth: true, tests: {}, logs }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Test Graph API calls
      const tests: Record<string, { status: number; ok: boolean; error?: string; data?: string }> = {};

      // Test 1: GET /me
      log("Testing GET /me ...");
      try {
        const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const meBody = await meRes.text();
        tests["GET /me"] = {
          status: meRes.status,
          ok: meRes.ok,
          data: meRes.ok ? JSON.parse(meBody).displayName : undefined,
          error: !meRes.ok ? meBody.substring(0, 200) : undefined,
        };
        log(`GET /me: ${meRes.status} ${meRes.ok ? "OK" : "FAILED"}`);
        if (!meRes.ok && meRes.status === 403) {
          log("ANBEFALING: Mangler User.Read scope. Brukeren må logge inn på nytt med prompt=consent.");
        }
      } catch (e) {
        tests["GET /me"] = { status: 0, ok: false, error: String(e) };
        log(`GET /me exception: ${e}`);
      }

      // Test 2: GET /me/messages?$top=1
      log("Testing GET /me/messages?$top=1 ...");
      try {
        const mailRes = await fetch("https://graph.microsoft.com/v1.0/me/messages?$top=1", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const mailBody = await mailRes.text();
        tests["GET /me/messages"] = {
          status: mailRes.status,
          ok: mailRes.ok,
          data: mailRes.ok ? `${JSON.parse(mailBody).value?.length || 0} melding(er)` : undefined,
          error: !mailRes.ok ? mailBody.substring(0, 200) : undefined,
        };
        log(`GET /me/messages: ${mailRes.status} ${mailRes.ok ? "OK" : "FAILED"}`);
        if (!mailRes.ok && (mailRes.status === 403 || mailRes.status === 401)) {
          log("ANBEFALING: Mangler Mail.ReadWrite scope. Re-autentiser med prompt=consent.");
        }
      } catch (e) {
        tests["GET /me/messages"] = { status: 0, ok: false, error: String(e) };
        log(`GET /me/messages exception: ${e}`);
      }

      // Test 3: GET /me/calendar/events?$top=1
      log("Testing GET /me/calendar/events?$top=1 ...");
      try {
        const calRes = await fetch("https://graph.microsoft.com/v1.0/me/calendar/events?$top=1", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const calBody = await calRes.text();
        tests["GET /me/calendar/events"] = {
          status: calRes.status,
          ok: calRes.ok,
          data: calRes.ok ? `${JSON.parse(calBody).value?.length || 0} hendelse(r)` : undefined,
          error: !calRes.ok ? calBody.substring(0, 200) : undefined,
        };
        log(`GET /me/calendar/events: ${calRes.status} ${calRes.ok ? "OK" : "FAILED"}`);
        if (!calRes.ok && (calRes.status === 403 || calRes.status === 401)) {
          log("ANBEFALING: Mangler Calendars.ReadWrite scope. Re-autentiser med prompt=consent.");
        }
      } catch (e) {
        tests["GET /me/calendar/events"] = { status: 0, ok: false, error: String(e) };
        log(`GET /me/calendar/events exception: ${e}`);
      }

      return new Response(
        JSON.stringify({ tests, logs }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[ms-debug] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
