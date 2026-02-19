import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Ensure Microsoft access token is valid; refresh if expired.
 */
async function ensureValidMsToken(
  supabaseAdmin: any,
  userId: string
): Promise<string | null> {
  const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userErr || !userData?.user) {
    console.error("[outlook-sync] Failed to fetch user:", userErr);
    return null;
  }

  const meta = userData.user.user_metadata || {};
  const accessToken = meta.ms_access_token;
  const refreshToken = meta.ms_refresh_token;
  const expiresAt = meta.ms_expires_at;

  if (!accessToken) return null;

  if (expiresAt && new Date(expiresAt).getTime() > Date.now() + 5 * 60 * 1000) {
    return accessToken;
  }

  if (!refreshToken) return null;

  console.log("[outlook-sync] Refreshing expired MS token for user", userId);

  const tokenRes = await fetch(
    "https://login.microsoftonline.com/" + Deno.env.get("AZURE_TENANT_ID") + "/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("AZURE_CLIENT_ID")!,
        client_secret: Deno.env.get("AZURE_CLIENT_SECRET")!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "https://graph.microsoft.com/.default offline_access",
      }),
    }
  );

  if (!tokenRes.ok) {
    console.error("[outlook-sync] Token refresh failed:", await tokenRes.text());
    return null;
  }

  const tokenData = await tokenRes.json();
  const newExpires = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      ms_access_token: tokenData.access_token,
      ms_refresh_token: tokenData.refresh_token || refreshToken,
      ms_expires_at: newExpires,
    },
  });

  return tokenData.access_token;
}

/**
 * Check if an Outlook event exists.
 */
async function checkOutlookEventExists(
  accessToken: string,
  techEmail: string,
  outlookEventId: string
): Promise<boolean> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${techEmail}/events/${outlookEventId}?$select=id`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  return res.ok;
}

/**
 * Create an Outlook calendar event.
 */
async function createOutlookEvent(
  accessToken: string,
  techEmail: string,
  event: any
): Promise<string | null> {
  const displayNumber = event.internal_number || event.job_number || "";
  const subject = displayNumber ? `${displayNumber} - ${event.title}` : event.title;

  const body: any = {
    subject,
    body: {
      contentType: "HTML",
      content: `<b>Kunde:</b> ${event.customer || "Ikke angitt"}<br/><b>Adresse:</b> ${event.address || "Ikke angitt"}${event.description ? `<br/><b>Beskrivelse:</b> ${event.description}` : ""}`,
    },
    start: { dateTime: event.start_time, timeZone: "Europe/Oslo" },
    end: { dateTime: event.end_time, timeZone: "Europe/Oslo" },
  };

  if (event.address) {
    body.location = { displayName: event.address };
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${techEmail}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    console.error("[outlook-sync] Create event failed:", res.status, await res.text());
    return null;
  }

  const data = await res.json();
  return data.id || null;
}

/**
 * Delete an Outlook event.
 */
async function deleteOutlookEvent(
  accessToken: string,
  techEmail: string,
  outlookEventId: string
): Promise<boolean> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${techEmail}/events/${outlookEventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  return res.ok || res.status === 404;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, event_id, performed_by } = await req.json();

    if (!action || !event_id) {
      return new Response(JSON.stringify({ error: "Missing action or event_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch the event with technicians
    const { data: event, error: eventErr } = await supabaseAdmin
      .from("events")
      .select(`
        *,
        event_technicians (
          technician_id,
          technicians ( id, name, email, user_id )
        )
      `)
      .eq("id", event_id)
      .single();

    if (eventErr || !event) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const techs = (event.event_technicians ?? [])
      .filter((et: any) => et.technicians)
      .map((et: any) => et.technicians);

    const logAction = async (actionType: string, summary: string) => {
      await supabaseAdmin.from("event_logs").insert({
        event_id,
        action_type: actionType,
        performed_by: performed_by || null,
        change_summary: summary,
      });
    };

    const notifyAdmins = async (title: string, message: string, type: string) => {
      const { data: adminRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"]);

      if (adminRoles && adminRoles.length > 0) {
        await supabaseAdmin.from("notifications").insert(
          adminRoles.map((r: any) => ({
            user_id: r.user_id,
            event_id,
            type,
            title,
            message,
          }))
        );
      }
    };

    // ─── ACTION: check_and_restore ───
    // Check if Outlook event still exists, recreate if missing
    if (action === "check_and_restore") {
      if (!event.microsoft_event_id) {
        return new Response(JSON.stringify({ status: "no_outlook_event" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Skip cancelled events
      if (event.status === "cancelled" || event.outlook_sync_status === "cancelled") {
        return new Response(JSON.stringify({ status: "cancelled_skip" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get first tech with user_id for token
      const tech = techs.find((t: any) => t.user_id && t.email);
      if (!tech) {
        await supabaseAdmin.from("events").update({
          outlook_sync_status: "failed",
        }).eq("id", event_id);
        return new Response(JSON.stringify({ error: "No technician with credentials" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const msToken = await ensureValidMsToken(supabaseAdmin, tech.user_id);
      if (!msToken) {
        await supabaseAdmin.from("events").update({
          outlook_sync_status: "failed",
        }).eq("id", event_id);
        return new Response(JSON.stringify({ error: "No valid MS token" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const exists = await checkOutlookEventExists(msToken, tech.email, event.microsoft_event_id);

      if (exists) {
        await supabaseAdmin.from("events").update({
          outlook_sync_status: "synced",
          outlook_last_synced_at: new Date().toISOString(),
        }).eq("id", event_id);

        return new Response(JSON.stringify({ status: "synced" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Event missing in Outlook → recreate
      console.log("[outlook-sync] Event missing in Outlook, recreating:", event_id);

      const newOutlookId = await createOutlookEvent(msToken, tech.email, event);

      if (newOutlookId) {
        await supabaseAdmin.from("events").update({
          microsoft_event_id: newOutlookId,
          outlook_sync_status: "restored",
          outlook_last_synced_at: new Date().toISOString(),
          outlook_deleted_at: new Date().toISOString(),
        }).eq("id", event_id);

        await logAction("outlook_restored", `Outlook-event ble slettet manuelt og gjenopprettet automatisk for ${tech.name}`);
        await notifyAdmins(
          event.internal_number || event.title,
          `⚠ Outlook-event for "${event.title}" ble slettet manuelt og gjenopprettet.`,
          "outlook_restored"
        );

        return new Response(JSON.stringify({ status: "restored", new_event_id: newOutlookId }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        await supabaseAdmin.from("events").update({
          outlook_sync_status: "failed",
        }).eq("id", event_id);

        await logAction("outlook_restore_failed", `Kunne ikke gjenopprette Outlook-event for ${tech.name}`);

        return new Response(JSON.stringify({ status: "restore_failed" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── ACTION: resync ───
    // Force create/update Outlook event
    if (action === "resync") {
      const tech = techs.find((t: any) => t.user_id && t.email);
      if (!tech) {
        return new Response(JSON.stringify({ error: "No technician with credentials" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const msToken = await ensureValidMsToken(supabaseAdmin, tech.user_id);
      if (!msToken) {
        return new Response(JSON.stringify({ error: "No valid MS token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete old if exists
      if (event.microsoft_event_id) {
        await deleteOutlookEvent(msToken, tech.email, event.microsoft_event_id);
      }

      const newOutlookId = await createOutlookEvent(msToken, tech.email, event);

      if (newOutlookId) {
        await supabaseAdmin.from("events").update({
          microsoft_event_id: newOutlookId,
          outlook_sync_status: "synced",
          outlook_last_synced_at: new Date().toISOString(),
        }).eq("id", event_id);

        await logAction("outlook_resynced", `Outlook-event tvunget resynkronisert av admin`);

        return new Response(JSON.stringify({ status: "resynced", new_event_id: newOutlookId }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        await supabaseAdmin.from("events").update({
          outlook_sync_status: "failed",
        }).eq("id", event_id);
        return new Response(JSON.stringify({ error: "Failed to create Outlook event" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── ACTION: delete_outlook ───
    if (action === "delete_outlook") {
      const tech = techs.find((t: any) => t.user_id && t.email);
      if (!tech || !event.microsoft_event_id) {
        return new Response(JSON.stringify({ error: "No event or tech to delete" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const msToken = await ensureValidMsToken(supabaseAdmin, tech.user_id);
      if (!msToken) {
        return new Response(JSON.stringify({ error: "No valid MS token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await deleteOutlookEvent(msToken, tech.email, event.microsoft_event_id);

      await supabaseAdmin.from("events").update({
        outlook_sync_status: "cancelled",
        outlook_deleted_at: new Date().toISOString(),
      }).eq("id", event_id);

      await logAction("outlook_deleted", `Outlook-event slettet manuelt av admin`);

      return new Response(JSON.stringify({ status: "deleted" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: disconnect ───
    if (action === "disconnect") {
      await supabaseAdmin.from("events").update({
        microsoft_event_id: null,
        outlook_sync_status: "not_synced",
        outlook_last_synced_at: null,
        outlook_deleted_at: null,
      }).eq("id", event_id);

      await logAction("outlook_disconnected", `Outlook-kobling fjernet av admin`);

      return new Response(JSON.stringify({ status: "disconnected" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[outlook-sync] Exception:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
