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
      console.error("[add-technicians] Missing Authorization header");
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

    console.log("[add-technicians] Caller:", user.id);

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    console.log("[add-technicians] Caller role:", roleData?.role);

    if (!roleData || (roleData.role !== "admin" && roleData.role !== "super_admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { employees } = body;
    console.log("[add-technicians] Employees to add:", JSON.stringify(employees));

    if (!Array.isArray(employees) || employees.length === 0) {
      return new Response(JSON.stringify({ error: "No employees provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];
    for (const emp of employees) {
      const email = emp.email.toLowerCase();
      const name = emp.name;
      console.log("[add-technicians] Processing:", email, name);

      // STEP 1: Find or create auth user
      let authUserId: string | null = null;
      let createdAuthUser = false;

      const { data: existingUsers, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (listErr) {
        console.error("[add-technicians] listUsers error:", listErr.message);
        results.push({ email, success: false, error: "listUsers failed: " + listErr.message });
        continue;
      }

      const existing = existingUsers.users.find((u: any) => u.email?.toLowerCase() === email);
      if (existing) {
        authUserId = existing.id;
        console.log("[add-technicians] Found existing auth user:", authUserId);
      } else {
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: name, app_role: "montør" },
        });

        if (createErr || !newUser?.user) {
          console.error("[add-technicians] createUser failed for", email, ":", createErr?.message);
          results.push({ email, success: false, error: "Auth user creation failed: " + (createErr?.message || "unknown") });
          continue;
        }

        authUserId = newUser.user.id;
        createdAuthUser = true;
        console.log("[add-technicians] Created auth user:", authUserId);
      }

      // STEP 2: Ensure user_roles row with role = montør
      const { data: existingRole } = await supabaseAdmin
        .from("user_roles")
        .select("id, role")
        .eq("user_id", authUserId)
        .maybeSingle();

      if (!existingRole) {
        const { error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: authUserId, role: "montør" });

        if (roleErr) {
          console.error("[add-technicians] Role insert failed for", email, ":", roleErr.message);
          results.push({ email, success: false, error: "Role insert failed: " + roleErr.message });
          continue;
        }
        console.log("[add-technicians] Role 'montør' assigned for", email);
      } else {
        console.log("[add-technicians] Role already exists:", existingRole.role);
      }

      // STEP 3: Upsert technician with user_id (NOT NULL required)
      const { data: techData, error: techErr } = await supabaseAdmin
        .from("technicians")
        .upsert(
          {
            name,
            email,
            microsoft_user_id: emp.microsoftId || null,
            user_id: authUserId,
          },
          { onConflict: "email" }
        )
        .select()
        .single();

      if (techErr) {
        console.error("[add-technicians] Technician upsert failed for", email, ":", techErr.message);
        results.push({ email, success: false, error: "Technician upsert failed: " + techErr.message });
        continue;
      }

      console.log("[add-technicians] Technician upserted:", techData?.id, "user_id:", authUserId);

      results.push({
        email,
        success: true,
        createdAuthUser,
        authUserId,
        technicianId: techData?.id,
        role: existingRole?.role || "montør",
      });
    }

    console.log("[add-technicians] Results:", JSON.stringify(results));
    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[add-technicians] Unhandled error:", err?.message || String(err), err?.stack);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
