import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Read provider_token from request body
    const body = await req.json().catch(() => null);
    const providerToken = body?.provider_token;

    if (!providerToken) {
      return new Response(JSON.stringify({ error: "provider_token missing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch employees from Microsoft Graph
    const graphRes = await fetch(
      "https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=999",
      {
        headers: {
          Authorization: `Bearer ${providerToken}`,
        },
      }
    );

    if (!graphRes.ok) {
      const errText = await graphRes.text();
      console.error("Graph API error:", errText);

      return new Response(JSON.stringify({ error: errText }), {
        status: graphRes.status,
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
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
