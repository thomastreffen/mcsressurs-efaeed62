import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshMicrosoftToken(
  supabaseAdmin: any,
  userId: string,
  refreshToken: string
): Promise<{ access_token: string; expires_at: string } | null> {
  const clientId = Deno.env.get("AZURE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET")!;
  const tenantId = Deno.env.get("AZURE_TENANT_ID")!;

  console.log("[fetch-employees] Refreshing Microsoft token for user:", userId);

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: "openid profile email User.Read User.Read.All Calendars.ReadWrite offline_access",
      }),
    }
  );

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("[fetch-employees] Token refresh failed:", errText);
    return null;
  }

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

  await supabaseAdmin
    .from("microsoft_tokens")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || refreshToken,
      expires_at: expiresAt,
    })
    .eq("user_id", userId);

  console.log("[fetch-employees] Token refreshed and stored, expires_at:", expiresAt);
  return { access_token: tokens.access_token, expires_at: expiresAt };
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

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsErr } = await supabaseAnon.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );

    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (!roleData || (roleData.role !== "admin" && roleData.role !== "super_admin")) {
      return new Response(JSON.stringify({ error: "Forbidden - admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read Microsoft token from DB
    const { data: tokenData, error: tokenErr } = await supabaseAdmin
      .from("microsoft_tokens")
      .select("access_token, refresh_token, expires_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (tokenErr || !tokenData) {
      console.error("[fetch-employees] No Microsoft token found for user:", userId, tokenErr?.message);
      return new Response(JSON.stringify({ error: "No Microsoft token found. Please log out and log in again." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accessToken = tokenData.access_token;

    // Check expiration and refresh if needed
    const now = new Date();
    const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
    const isExpired = !expiresAt || expiresAt <= now;

    if (isExpired) {
      console.log("[fetch-employees] Token expired, attempting refresh...");
      if (!tokenData.refresh_token) {
        return new Response(JSON.stringify({ error: "Microsoft token expired and no refresh token available. Please log out and log in again." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const refreshed = await refreshMicrosoftToken(supabaseAdmin, userId, tokenData.refresh_token);
      if (!refreshed) {
        return new Response(JSON.stringify({ error: "Failed to refresh Microsoft token. Please log out and log in again." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      accessToken = refreshed.access_token;
    } else {
      console.log("[fetch-employees] Using stored token, expires_at:", tokenData.expires_at);
    }

    // Fetch employees from Microsoft Graph
    const graphRes = await fetch(
      "https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=999",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!graphRes.ok) {
      const errText = await graphRes.text();
      console.error("[fetch-employees] Graph API error:", graphRes.status, errText);

      // If 401 from Graph, try refresh once
      if (graphRes.status === 401 && tokenData.refresh_token) {
        console.log("[fetch-employees] Graph returned 401, attempting token refresh...");
        const refreshed = await refreshMicrosoftToken(supabaseAdmin, userId, tokenData.refresh_token);
        if (refreshed) {
          const retryRes = await fetch(
            "https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=999",
            { headers: { Authorization: `Bearer ${refreshed.access_token}` } }
          );
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            console.log("[fetch-employees] Retry succeeded after refresh");
            // Continue with retryData below
            const { data: existingTechs } = await supabaseAdmin
              .from("technicians")
              .select("email, microsoft_user_id");
            const existingEmails = new Set((existingTechs || []).map((t: any) => t.email?.toLowerCase()));
            const existingMsIds = new Set((existingTechs || []).map((t: any) => t.microsoft_user_id));
            const employees = (retryData.value || []).map((u: any) => ({
              microsoftId: u.id,
              name: u.displayName,
              email: u.mail || u.userPrincipalName,
              jobTitle: u.jobTitle,
              department: u.department,
              alreadyAdded: existingEmails.has((u.mail || u.userPrincipalName)?.toLowerCase()) || existingMsIds.has(u.id),
            }));
            return new Response(JSON.stringify({ employees }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const retryErr = await retryRes.text();
          console.error("[fetch-employees] Retry also failed:", retryErr);
        }
        return new Response(JSON.stringify({ error: "Microsoft token invalid. Please log out and log in again." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: errText }), {
        status: graphRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const graphData = await graphRes.json();
    console.log("[fetch-employees] Graph returned", (graphData.value || []).length, "users");

    const { data: existingTechs } = await supabaseAdmin
      .from("technicians")
      .select("email, microsoft_user_id");

    const existingEmails = new Set((existingTechs || []).map((t: any) => t.email?.toLowerCase()));
    const existingMsIds = new Set((existingTechs || []).map((t: any) => t.microsoft_user_id));

    const employees = (graphData.value || []).map((u: any) => ({
      microsoftId: u.id,
      name: u.displayName,
      email: u.mail || u.userPrincipalName,
      jobTitle: u.jobTitle,
      department: u.department,
      alreadyAdded: existingEmails.has((u.mail || u.userPrincipalName)?.toLowerCase()) || existingMsIds.has(u.id),
    }));

    return new Response(JSON.stringify({ employees }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[fetch-employees] Exception:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
