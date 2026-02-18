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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is super_admin
    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (callerRole?.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden: super_admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all auth users
    const { data: authUsers, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      console.error("[list-users] listUsers error:", listErr.message);
      return new Response(JSON.stringify({ error: listErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all roles keyed by user_id
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const roleMap = new Map((roles || []).map((r: any) => [r.user_id, r.role]));

    // Get all technicians keyed by user_id
    const { data: technicians } = await supabaseAdmin
      .from("technicians")
      .select("user_id, name, email");
    const techMap = new Map(
      (technicians || []).map((t: any) => [t.user_id, { name: t.name, email: t.email }])
    );

    // Diagnostics
    const orphanedTechs = (technicians || []).filter((t: any) => !t.user_id);
    if (orphanedTechs.length > 0) {
      console.warn("[list-users] Technicians without user_id:", JSON.stringify(orphanedTechs));
    }

    const authIds = new Set(authUsers.users.map((u: any) => u.id));
    const rolesWithoutAuth = (roles || []).filter((r: any) => !authIds.has(r.user_id));
    if (rolesWithoutAuth.length > 0) {
      console.warn("[list-users] user_roles without auth.users:", JSON.stringify(rolesWithoutAuth));
    }

    const usersWithoutRoles = authUsers.users.filter((u: any) => !roleMap.has(u.id));
    if (usersWithoutRoles.length > 0) {
      console.warn("[list-users] auth.users without user_roles:", usersWithoutRoles.map((u: any) => u.id));
    }

    // Build response: join on user_id only
    // Only include users that have a role (INNER JOIN user_roles)
    // LEFT JOIN technicians for name
    const users = authUsers.users
      .filter((u: any) => roleMap.has(u.id))
      .map((u: any) => {
        const tech = techMap.get(u.id);
        return {
          id: u.id,
          email: tech?.email || u.email || "",
          name: tech?.name || "",
          role: roleMap.get(u.id),
        };
      });

    return new Response(JSON.stringify({ users }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[list-users] Error:", err?.message || String(err));
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
