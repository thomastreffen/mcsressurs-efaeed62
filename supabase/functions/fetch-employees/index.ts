import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshAccessToken(supabaseAdmin: any, userId: string, refreshToken: string): Promise<string | null> {
  const clientId = Deno.env.get("AZURE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET")!;
  const tenantId = Deno.env.get("AZURE_TENANT_ID")!;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: "openid profile email User.Read Calendars.ReadWrite User.Read.All offline_access",
      }),
    }
  );

  if (!res.ok) {
    console.error("Token refresh failed:", await res.text());
    return null;
  }

  const tokens = await res.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

  await supabaseAdmin.from("microsoft_tokens").upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || refreshToken,
    expires_at: expiresAt,
  }, { onConflict: "user_id" });

  return tokens.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
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

    // Verify user via anon client
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

    // Get Microsoft token
    const { data: tokenData } = await supabaseAdmin
      .from("microsoft_tokens")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!tokenData) {
      return new Response(JSON.stringify({ error: "No Microsoft token found. Please re-login." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accessToken = tokenData.access_token;

    // Check if token is expired and refresh
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      if (!tokenData.refresh_token) {
        return new Response(JSON.stringify({ error: "Token expired, no refresh token. Please re-login." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const newToken = await refreshAccessToken(supabaseAdmin, userId, tokenData.refresh_token);
      if (!newToken) {
        return new Response(JSON.stringify({ error: "Token refresh failed. Please re-login." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      accessToken = newToken;
    }

    // Fetch employees from Microsoft Graph
    const graphRes = await fetch(
      "https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=999",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!graphRes.ok) {
      const errText = await graphRes.text();
      console.error("Graph API error:", errText);

      // If 401, try refresh once
      if (graphRes.status === 401 && tokenData.refresh_token) {
        const newToken = await refreshAccessToken(supabaseAdmin, userId, tokenData.refresh_token);
        if (newToken) {
          const retryRes = await fetch(
            "https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=999",
            { headers: { Authorization: `Bearer ${newToken}` } }
          );
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            
            // Get existing technicians for comparison
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
          await retryRes.text(); // consume body
        }
      }

      return new Response(JSON.stringify({ error: "Failed to fetch employees from Microsoft" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const graphData = await graphRes.json();

    // Get existing technicians for comparison
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
    console.error("Fetch employees error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
