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

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Check if user exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      // Update metadata
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          full_name: displayName,
          microsoft_id: profile.id,
          avatar_url: null,
        },
      });
    } else {
      // Create new user with random password (they authenticate via MS)
      const { data: newUser, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            full_name: displayName,
            microsoft_id: profile.id,
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

      // Assign default montør role
      await supabaseAdmin.from("user_roles").insert({
        user_id: userId,
        role: "montør",
      });

      // Link to technicians table if matching email exists
      await supabaseAdmin
        .from("technicians")
        .update({ user_id: userId })
        .eq("email", email.toLowerCase());
    }

    // Generate a session for the user
    // We use admin.generateLink to create a magic link, then extract the token
    // Alternative: sign in with password approach
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

    // Extract the hashed_token to verify OTP and create a session
    const { data: sessionData, error: verifyErr } =
      await supabaseAdmin.auth.verifyOtp({
        token_hash: signInData.properties.hashed_token,
        type: "magiclink",
      });

    if (verifyErr || !sessionData.session) {
      console.error("OTP verification failed:", verifyErr);
      return new Response(
        JSON.stringify({ error: "Session verification failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store Microsoft tokens for Graph API access
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
    await supabaseAdmin
      .from("microsoft_tokens")
      .upsert({
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expires_at: expiresAt,
      }, { onConflict: "user_id" });

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
