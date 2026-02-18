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

    const callerId = user.id;
    console.log("[add-technicians] Authenticated callerId:", callerId);

    // Check admin role
    const { data: roleData, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .single();

    console.log("[add-technicians] Role lookup - data:", roleData, "error:", roleErr?.message);

    if (!roleData || (roleData.role !== "admin" && roleData.role !== "super_admin")) {
      console.error("[add-technicians] Forbidden - role:", roleData?.role, "callerId:", callerId);
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
      const email = emp.email.toLowerCase();
      console.log("[add-technicians] Processing:", email, emp.name);

      // 1. Check if auth user already exists by email
      const { data: existingUsers, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      
      let authUserId: string | null = null;
      let createdAuthUser = false;

      if (listErr) {
        console.error("[add-technicians] listUsers error:", listErr.message);
      } else {
        const existing = existingUsers.users.find(
          (u: any) => u.email?.toLowerCase() === email
        );
        if (existing) {
          authUserId = existing.id;
          console.log("[add-technicians] Existing auth user found:", authUserId);
        }
      }

      // 2. If no auth user exists, create one
      if (!authUserId) {
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: email,
          email_confirm: true,
          user_metadata: {
            full_name: emp.name,
            app_role: "montør",
          },
        });

        if (createErr) {
          console.error("[add-technicians] createUser error for", email, ":", createErr.message);
          results.push({ email, success: false, error: "Failed to create auth user: " + createErr.message });
          continue;
        }

        authUserId = newUser.user.id;
        createdAuthUser = true;
        console.log("[add-technicians] Created auth user:", authUserId, "for", email);
      }

      // 3. Upsert technician row with user_id set
      const { data: techData, error: techErr } = await supabaseAdmin.from("technicians").upsert(
        {
          name: emp.name,
          email: email,
          microsoft_user_id: emp.microsoftId || null,
          user_id: authUserId,
        },
        { onConflict: "email" }
      ).select().single();

      if (techErr) {
        console.error("[add-technicians] Upsert technician error for", email, ":", techErr.message);
        results.push({ email, success: false, error: "Technician upsert failed: " + techErr.message });
        continue;
      }

      console.log("[add-technicians] Technician upserted - id:", techData?.id, "user_id:", authUserId);

      // 4. Ensure user_roles row exists with role = montør
      const { data: existingRole } = await supabaseAdmin
        .from("user_roles")
        .select("id, role")
        .eq("user_id", authUserId)
        .maybeSingle();

      if (!existingRole) {
        const { error: roleInsertErr } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: authUserId, role: "montør" });

        if (roleInsertErr) {
          console.error("[add-technicians] Role insert error for", email, ":", roleInsertErr.message);
        } else {
          console.log("[add-technicians] Role 'montør' assigned for", email, "userId:", authUserId);
        }
      } else {
        console.log("[add-technicians] Role already exists for", email, ":", existingRole.role);
      }

      results.push({
        email,
        success: true,
        createdAuthUser,
        authUserId,
        technicianId: techData?.id,
        role: existingRole?.role || "montør",
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
