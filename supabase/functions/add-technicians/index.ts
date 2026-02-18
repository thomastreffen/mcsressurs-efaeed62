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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[add-technicians] Missing or invalid Authorization header");
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

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabaseAnon.auth.getUser(jwt);

    if (userErr || !user) {
      console.error("[add-technicians] getUser failed:", userErr?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    console.log("[add-technicians] Authenticated userId:", userId);

    // Check admin role
    const { data: roleData, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    console.log("[add-technicians] Role lookup - data:", roleData, "error:", roleErr?.message);

    if (!roleData || (roleData.role !== "admin" && roleData.role !== "super_admin")) {
      console.error("[add-technicians] Forbidden - role:", roleData?.role, "userId:", userId);
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { employees } = body;
    console.log("[add-technicians] Received employees:", JSON.stringify(employees));

    if (!Array.isArray(employees) || employees.length === 0) {
      console.error("[add-technicians] No employees provided in body");
      return new Response(JSON.stringify({ error: "No employees provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];
    for (const emp of employees) {
      console.log("[add-technicians] Upserting:", emp.email, emp.name, emp.microsoftId);
      const { data, error } = await supabaseAdmin.from("technicians").upsert(
        {
          name: emp.name,
          email: emp.email.toLowerCase(),
          microsoft_user_id: emp.microsoftId,
        },
        { onConflict: "email" }
      ).select().single();

      if (error) {
        console.error("[add-technicians] Upsert error for", emp.email, ":", error.message, error.details, error.hint);
      } else {
        console.log("[add-technicians] Upsert success for", emp.email, "- id:", data?.id);
      }

      results.push({
        email: emp.email,
        success: !error,
        error: error?.message,
      });
    }

    console.log("[add-technicians] Final results:", JSON.stringify(results));
    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[add-technicians] Unhandled exception:", err?.message || String(err), err?.stack);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
