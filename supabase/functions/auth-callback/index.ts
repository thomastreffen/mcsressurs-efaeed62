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
    const { code, redirect_uri } = await req.json();

    if (!code || !redirect_uri) {
      return new Response(
        JSON.stringify({ error: "Missing code or redirect_uri" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientId = Deno.env.get("AZURE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET")!;
    const tenantId = Deno.env.get("AZURE_TENANT_ID")!;

    // Exchange code for tokens
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri,
          grant_type: "authorization_code",
          scope: "openid profile email User.Read Calendars.ReadWrite User.Read.All offline_access",
        }),
      }
    );

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Token exchange failed:", err);
      return new Response(
        JSON.stringify({ error: "Token exchange failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokens = await tokenRes.json();

    // Get user profile from MS Graph
    const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch user profile" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const profile = await profileRes.json();
    const email = profile.mail || profile.userPrincipalName;
    const displayName = profile.displayName || email;

    // Create Supabase admin client (service_role for microsoft_tokens access)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Check if user exists
    const { data: { users: matchedUsers } } = await supabaseAdmin.auth.admin.listUsers({
      filter: email.toLowerCase(),
      perPage: 1,
    });
    const existingUser = matchedUsers?.[0] || null;
    console.log("[auth-callback] User lookup for", email, "found:", !!existingUser);

    let userId: string;

    // Fetch existing role if user exists
    let existingRole: string | null = null;
    if (existingUser) {
      const { data: roleData } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", existingUser.id)
        .maybeSingle();
      existingRole = roleData?.role || null;
    }

    if (existingUser) {
      userId = existingUser.id;
      // Update user_metadata WITHOUT tokens – only profile info
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          full_name: displayName,
          microsoft_id: profile.id,
          avatar_url: null,
          app_role: existingRole || "montør",
        },
      });
      console.log("[auth-callback] Updated user_metadata (no tokens) for:", userId);
    } else {
      // Create new user – no tokens in metadata
      const { data: newUser, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            full_name: displayName,
            microsoft_id: profile.id,
            app_role: "montør",
          },
          password: crypto.randomUUID() + crypto.randomUUID(),
        });

      if (createErr || !newUser.user) {
        console.error("User creation failed:", createErr);
        return new Response(
          JSON.stringify({ error: "Failed to create user" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = newUser.user.id;

      // Assign default role
      await supabaseAdmin.from("user_roles").insert({
        user_id: userId,
        role: "montør",
      });

      // Link to technicians table if matching email
      await supabaseAdmin
        .from("technicians")
        .update({ user_id: userId })
        .eq("email", email.toLowerCase());

      console.log("[auth-callback] Created new user:", userId);
    }

    // Store Microsoft tokens in database table (NOT user_metadata)
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
    console.log("[auth-callback] Saving token for userId:", userId);
    const { error: tokenStoreErr } = await supabaseAdmin
      .from("microsoft_tokens")
      .upsert({
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expires_at: expiresAt,
      }, { onConflict: "user_id" });

    if (tokenStoreErr) {
      console.error("[auth-callback] Token store error:", tokenStoreErr.message);
    } else {
      console.log("[auth-callback] Token stored in microsoft_tokens table");
    }

    // Generate session via magic link + OTP verify
    const { data: signInData, error: signInErr } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

    if (signInErr || !signInData) {
      console.error("Magic link generation failed:", signInErr);
      return new Response(
        JSON.stringify({ error: "Session creation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: sessionData, error: verifySessionErr } =
      await supabaseAdmin.auth.verifyOtp({
        token_hash: signInData.properties.hashed_token,
        type: "magiclink",
      });

    if (verifySessionErr || !sessionData.session) {
      console.error("OTP verification failed:", verifySessionErr);
      return new Response(
        JSON.stringify({ error: "Session verification failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch user role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    return new Response(
      JSON.stringify({
        session: sessionData.session,
        user: {
          id: userId,
          email,
          name: displayName,
          role: roleData?.role || "montør",
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Auth callback error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
