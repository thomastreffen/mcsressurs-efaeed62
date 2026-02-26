import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Token helper ── */
async function ensureValidMsToken(
  supabaseAdmin: any,
  userId: string
): Promise<string | null> {
  const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !userData?.user) return null;

  const meta = userData.user.user_metadata || {};
  const accessToken = meta.ms_access_token;
  const refreshToken = meta.ms_refresh_token;
  const expiresAt = meta.ms_expires_at;

  if (!accessToken) return null;

  // Still valid?
  if (expiresAt && new Date(expiresAt).getTime() > Date.now() + 5 * 60 * 1000) {
    return accessToken;
  }

  if (!refreshToken) return null;

  console.log("[calendar-write-sync] Refreshing MS token for", userId);

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${Deno.env.get("AZURE_TENANT_ID")}/oauth2/v2.0/token`,
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
    console.error("[calendar-write-sync] Token refresh failed:", await tokenRes.text());
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

/* ── Build Graph event body ── */
function buildGraphBody(event: any) {
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

  return body;
}

/* ── Resolve caller user_id from token ── */
async function resolveCallerUserId(req: Request, supabaseAdmin: any): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const callerUserId = await resolveCallerUserId(req, supabaseAdmin);

    const body = await req.json();
    const { action, event_id } = body;

    if (!action || !event_id) {
      return new Response(JSON.stringify({ error: "Missing action or event_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch event with technicians
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

    // Find a technician with a valid MS token
    const techs = (event.event_technicians ?? [])
      .filter((et: any) => et.technicians?.user_id && et.technicians?.email)
      .map((et: any) => et.technicians);

    // Also try the caller user directly
    const userIdsToTry = [
      ...(callerUserId ? [callerUserId] : []),
      ...techs.map((t: any) => t.user_id),
    ];

    let msToken: string | null = null;
    let tokenUserId: string | null = null;
    let tokenUserEmail: string | null = null;

    for (const uid of userIdsToTry) {
      msToken = await ensureValidMsToken(supabaseAdmin, uid);
      if (msToken) {
        tokenUserId = uid;
        // Find email for this user
        const tech = techs.find((t: any) => t.user_id === uid);
        if (tech) {
          tokenUserEmail = tech.email;
        } else {
          // Get from user metadata
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
          tokenUserEmail = u?.user?.email || null;
        }
        break;
      }
    }

    if (!msToken || !tokenUserEmail) {
      console.log("[calendar-write-sync] No valid MS token found for event", event_id);
      return new Response(JSON.stringify({ status: "no_token", message: "Ingen gyldig Microsoft-tilkobling" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const logAction = async (actionType: string, summary: string) => {
      await supabaseAdmin.from("event_logs").insert({
        event_id,
        action_type: actionType,
        performed_by: callerUserId || null,
        change_summary: summary,
      });
    };

    // ─── ACTION: create ───
    if (action === "create") {
      const graphBody = buildGraphBody(event);

      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${tokenUserEmail}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${msToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(graphBody),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error("[calendar-write-sync] Create failed:", res.status, errText);
        await logAction("outlook_create_failed", `Graph POST feilet: ${res.status}`);
        return new Response(JSON.stringify({ status: "error", code: res.status, detail: errText }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      const graphEventId = data.id;
      const etag = data["@odata.etag"] || null;

      await supabaseAdmin.from("events").update({
        microsoft_event_id: graphEventId,
        microsoft_etag: etag,
        outlook_sync_status: "synced",
        outlook_last_synced_at: new Date().toISOString(),
      }).eq("id", event_id);

      await logAction("outlook_created", `Outlook-event opprettet for ${tokenUserEmail}`);

      return new Response(JSON.stringify({ status: "created", graph_event_id: graphEventId, etag }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: update ───
    if (action === "update") {
      const graphBody = buildGraphBody(event);

      if (event.microsoft_event_id) {
        // PATCH existing
        const headers: Record<string, string> = {
          Authorization: `Bearer ${msToken}`,
          "Content-Type": "application/json",
        };
        if (event.microsoft_etag) {
          headers["If-Match"] = event.microsoft_etag;
        }

        const res = await fetch(
          `https://graph.microsoft.com/v1.0/users/${tokenUserEmail}/events/${event.microsoft_event_id}`,
          { method: "PATCH", headers, body: JSON.stringify(graphBody) }
        );

        if (res.status === 409 || res.status === 412) {
          // Conflict – fetch current from Graph
          console.warn("[calendar-write-sync] Conflict detected, fetching Graph version");
          const getRes = await fetch(
            `https://graph.microsoft.com/v1.0/users/${tokenUserEmail}/events/${event.microsoft_event_id}?$select=id,subject,start,end`,
            { headers: { Authorization: `Bearer ${msToken}` } }
          );

          let graphVersion = null;
          if (getRes.ok) {
            graphVersion = await getRes.json();
          }

          await logAction("outlook_conflict", `Outlook-event endret utenfor systemet (${res.status})`);

          return new Response(JSON.stringify({
            status: "conflict",
            code: res.status,
            graph_version: graphVersion ? {
              start: graphVersion.start?.dateTime,
              end: graphVersion.end?.dateTime,
              subject: graphVersion.subject,
            } : null,
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!res.ok) {
          const errText = await res.text();
          console.error("[calendar-write-sync] PATCH failed:", res.status, errText);
          await logAction("outlook_update_failed", `Graph PATCH feilet: ${res.status}`);
          return new Response(JSON.stringify({ status: "error", code: res.status, detail: errText }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const data = await res.json();
        const newEtag = data["@odata.etag"] || null;

        await supabaseAdmin.from("events").update({
          microsoft_etag: newEtag,
          outlook_sync_status: "synced",
          outlook_last_synced_at: new Date().toISOString(),
        }).eq("id", event_id);

        await logAction("outlook_updated", `Outlook-event oppdatert for ${tokenUserEmail}`);

        return new Response(JSON.stringify({ status: "updated", etag: newEtag }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // No Graph event yet – create
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/users/${tokenUserEmail}/events`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${msToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(graphBody),
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          console.error("[calendar-write-sync] Create (from update) failed:", res.status, errText);
          await logAction("outlook_create_failed", `Graph POST feilet ved oppdatering: ${res.status}`);
          return new Response(JSON.stringify({ status: "error", code: res.status, detail: errText }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const data = await res.json();
        await supabaseAdmin.from("events").update({
          microsoft_event_id: data.id,
          microsoft_etag: data["@odata.etag"] || null,
          outlook_sync_status: "synced",
          outlook_last_synced_at: new Date().toISOString(),
        }).eq("id", event_id);

        await logAction("outlook_created", `Outlook-event opprettet (fra oppdatering) for ${tokenUserEmail}`);

        return new Response(JSON.stringify({ status: "created", graph_event_id: data.id }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── ACTION: delete ───
    if (action === "delete") {
      if (!event.microsoft_event_id) {
        return new Response(JSON.stringify({ status: "no_graph_event" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${tokenUserEmail}/events/${event.microsoft_event_id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${msToken}` },
        }
      );

      if (!res.ok && res.status !== 404) {
        const errText = await res.text();
        console.error("[calendar-write-sync] DELETE failed:", res.status, errText);
        await logAction("outlook_delete_failed", `Graph DELETE feilet: ${res.status}`);
        return new Response(JSON.stringify({ status: "error", code: res.status, detail: errText }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("events").update({
        microsoft_event_id: null,
        microsoft_etag: null,
        outlook_sync_status: "not_synced",
        outlook_last_synced_at: null,
      }).eq("id", event_id);

      await logAction("outlook_deleted", `Outlook-event slettet for ${tokenUserEmail}`);

      return new Response(JSON.stringify({ status: "deleted" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: force_update (override conflict) ───
    if (action === "force_update") {
      const graphBody = buildGraphBody(event);

      if (!event.microsoft_event_id) {
        return new Response(JSON.stringify({ status: "no_graph_event" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // PATCH without If-Match to force
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${tokenUserEmail}/events/${event.microsoft_event_id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${msToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(graphBody),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        await logAction("outlook_force_update_failed", `Force PATCH feilet: ${res.status}`);
        return new Response(JSON.stringify({ status: "error", code: res.status, detail: errText }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      await supabaseAdmin.from("events").update({
        microsoft_etag: data["@odata.etag"] || null,
        outlook_sync_status: "synced",
        outlook_last_synced_at: new Date().toISOString(),
      }).eq("id", event_id);

      await logAction("outlook_force_updated", `Outlook-event tvunget oppdatert`);

      return new Response(JSON.stringify({ status: "force_updated", etag: data["@odata.etag"] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[calendar-write-sync] Exception:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
