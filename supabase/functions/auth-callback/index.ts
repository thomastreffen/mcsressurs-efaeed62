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

    // 1. Exchange code for Microsoft tokens
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
      console.error("[auth-callback] Token exchange failed:", err);
      return new Response(
        JSON.stringify({ error: "Token exchange failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokens = await tokenRes.json();

    // 2. Get user profile from MS Graph
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
    const email = (profile.mail || profile.userPrincipalName)?.toLowerCase();
    const displayName = profile.displayName || email;

    if (!email) {
      return new Response(
        JSON.stringify({ error: "No email found in Microsoft profile" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Create admin client (service_role)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 4. Duplicate guard – check exact email match in auth.users
    //    We do NOT use listUsers (fuzzy). Instead, generate magic link which
    //    targets exact email. If user doesn't exist, create first.
    
    // Try generating magic link – this only works if user exists
    let { data: signInData, error: signInErr } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

    // If user doesn't exist, create them first
    if (signInErr) {
      console.log("[auth-callback] User does not exist, creating:", email);

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
        console.error("[auth-callback] User creation failed:", createErr);
        return new Response(
          JSON.stringify({ error: "Failed to create user" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const newUserId = newUser.user.id;

      // Assign default role
      await supabaseAdmin.from("user_roles").insert({
        user_id: newUserId,
        role: "montør",
      });

      // Create technician record
      await supabaseAdmin.from("technicians").insert({
        user_id: newUserId,
        email,
        name: displayName,
      });

      console.log("[auth-callback] Created new user + technician:", newUserId);

      // Now generate magic link for the new user
      const retryLink = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

      if (retryLink.error || !retryLink.data) {
        console.error("[auth-callback] Magic link failed after create:", retryLink.error);
        return new Response(
          JSON.stringify({ error: "Session creation failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      signInData = retryLink.data;
      signInErr = null;
    }

    if (!signInData) {
      return new Response(
        JSON.stringify({ error: "Session creation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Verify OTP to create session – this gives us the AUTHORITATIVE user ID
    const { data: sessionData, error: verifyErr } =
      await supabaseAdmin.auth.verifyOtp({
        token_hash: signInData.properties.hashed_token,
        type: "magiclink",
      });

    if (verifyErr || !sessionData.session) {
      console.error("[auth-callback] OTP verification failed:", verifyErr);
      return new Response(
        JSON.stringify({ error: "Session verification failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Use session user ID – this is the ONLY source of truth
    const userId = sessionData.session.user.id;
    console.log("[auth-callback] Session user ID (authoritative):", userId);

    // 7. Update user_metadata (no tokens, only profile info)
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        full_name: displayName,
        microsoft_id: profile.id,
        avatar_url: null,
        app_role: existingRole?.role || "montør",
      },
    });

    // 8. Store Microsoft tokens in database – keyed by session user ID
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
      console.log("[auth-callback] Token stored in microsoft_tokens table for:", userId);
    }

    // 9. Fetch role for response
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
    console.error("[auth-callback] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
