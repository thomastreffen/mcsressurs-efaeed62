import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/**
 * Ensure Microsoft access token is valid for a user; refresh if expired.
 */
async function ensureValidMsToken(
  supabaseAdmin: any,
  userId: string,
  log: (msg: string) => void
): Promise<string | null> {
  const { data: userData, error: userErr } =
    await supabaseAdmin.auth.admin.getUserById(userId);
  if (userErr || !userData?.user) {
    log(`Failed to fetch user ${userId}: ${userErr?.message}`);
    return null;
  }

  const meta = userData.user.user_metadata || {};
  const accessToken = meta.ms_access_token;
  const refreshToken = meta.ms_refresh_token;
  const expiresAt = meta.ms_expires_at;

  if (!accessToken) {
    log(`No MS access token for user ${userId}`);
    return null;
  }

  // Valid if >5 min left
  if (expiresAt && new Date(expiresAt).getTime() > Date.now() + 5 * 60 * 1000) {
    return accessToken;
  }

  if (!refreshToken) {
    log(`Token expired, no refresh token for user ${userId}`);
    return null;
  }

  log(`Token expired for ${userId}, refreshing...`);

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
    const errText = await tokenRes.text();
    log(`Token refresh failed for ${userId}: ${tokenRes.status} ${errText.substring(0, 200)}`);
    return null;
  }

  const tokenData = await tokenRes.json();
  const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      ms_access_token: tokenData.access_token,
      ms_refresh_token: tokenData.refresh_token || refreshToken,
      ms_expires_at: newExpiry,
    },
  });

  log(`Token refreshed for ${userId}, expires ${newExpiry}`);
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const respond = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const jwt = authHeader.replace("Bearer ", "");
    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: authUser }, error: userErr } = await supabaseAnon.auth.getUser(jwt);
    if (userErr || !authUser) return respond({ error: "Invalid session" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const logs: string[] = [];
    const log = (msg: string) => {
      const ts = new Date().toISOString().slice(11, 23);
      const line = `[${ts}] ${msg}`;
      logs.push(line);
      console.log(`[ms-calendar] ${msg}`);
    };

    log(`Action: ${action}, caller: ${authUser.id}`);

    // ─── ACTION: availability ───
    if (action === "availability") {
      const { user_ids, start, end } = body;
      if (!user_ids?.length || !start || !end) {
        return respond({ error: "Missing user_ids, start, end", logs }, 400);
      }

      log(`Checking availability for ${user_ids.length} users, ${start} → ${end}`);

      // Get technician emails for these user_ids
      const { data: techs } = await supabaseAdmin
        .from("technicians")
        .select("id, email, name, user_id")
        .in("user_id", user_ids);

      if (!techs?.length) {
        log("No technicians found for given user_ids");
        return respond({ results: [], logs });
      }

      const techEmails = techs.map((t: any) => t.email).filter(Boolean);
      log(`Technician emails: ${techEmails.join(", ")}`);

      // Find an admin with valid MS token for getSchedule
      const { data: adminRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"])
        .limit(5);

      let msToken: string | null = null;
      for (const ar of adminRoles || []) {
        msToken = await ensureValidMsToken(supabaseAdmin, ar.user_id, log);
        if (msToken) break;
      }

      if (!msToken) {
        log("No admin with valid MS token found");
        return respond({ error: "No valid MS token for schedule check", logs }, 400);
      }

      const graphRes = await fetch(`${GRAPH_BASE}/me/calendar/getSchedule`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${msToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schedules: techEmails,
          startTime: { dateTime: start, timeZone: "Europe/Oslo" },
          endTime: { dateTime: end, timeZone: "Europe/Oslo" },
          availabilityViewInterval: 15,
        }),
      });

      if (!graphRes.ok) {
        const errText = await graphRes.text();
        log(`getSchedule failed: ${graphRes.status} ${errText.substring(0, 300)}`);
        return respond({ error: "getSchedule failed", details: errText.substring(0, 300), logs }, 500);
      }

      const graphData = await graphRes.json();
      const emailToTech = new Map(
        techs.map((t: any) => [t.email.toLowerCase(), { id: t.id, name: t.name, user_id: t.user_id }])
      );

      const results = (graphData.value || []).map((entry: any) => {
        const tech = emailToTech.get(entry.scheduleId?.toLowerCase());
        const busySlots = (entry.scheduleItems || [])
          .filter((s: any) => s.status !== "free")
          .map((s: any) => ({
            status: s.status,
            subject: s.subject || null,
            start: s.start?.dateTime,
            end: s.end?.dateTime,
            is_private: s.isPrivate || false,
          }));
        const isBusy = busySlots.length > 0;
        log(`${tech?.name || entry.scheduleId}: ${isBusy ? "BUSY" : "FREE"} (${busySlots.length} slots)`);
        return {
          technician_id: tech?.id || null,
          user_id: tech?.user_id || null,
          name: tech?.name || entry.scheduleId,
          email: entry.scheduleId,
          busy: isBusy,
          busy_slots: busySlots,
        };
      });

      return respond({ results, logs });
    }

    // ─── ACTION: upsert_job_events ───
    if (action === "upsert_job_events") {
      const { job_id, user_ids } = body;
      if (!job_id) return respond({ error: "Missing job_id", logs }, 400);

      // Fetch job
      const { data: job, error: jobErr } = await supabaseAdmin
        .from("events")
        .select("*")
        .eq("id", job_id)
        .single();

      if (jobErr || !job) {
        log(`Job not found: ${job_id}`);
        return respond({ error: "Job not found", logs }, 404);
      }

      // Determine technician user_ids to sync
      let targetUserIds = user_ids;
      if (!targetUserIds?.length) {
        const { data: ets } = await supabaseAdmin
          .from("event_technicians")
          .select("technician_id, technicians(user_id)")
          .eq("event_id", job_id);
        targetUserIds = (ets || [])
          .map((et: any) => et.technicians?.user_id)
          .filter(Boolean);
      }

      if (!targetUserIds?.length) {
        log("No technicians assigned to job");
        return respond({ error: "No technicians to sync", logs }, 400);
      }

      // Get technician details
      const { data: techs } = await supabaseAdmin
        .from("technicians")
        .select("id, email, name, user_id")
        .in("user_id", targetUserIds);

      const displayNumber = job.internal_number || job.job_number || job.id.slice(0, 8);
      const appUrl = Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", "").replace("https://", "") || "";
      // Build a link back to the job - we'll use a generic pattern
      const jobLink = `https://mcsressurs.lovable.app/jobs/${job_id}`;
      
      const subject = `JOBB ${displayNumber} | ${job.customer || "Ukjent kunde"} | ${job.title}`;
      const htmlBody = [
        `<b>Jobb:</b> ${displayNumber}`,
        `<b>Kunde:</b> ${job.customer || "Ikke angitt"}`,
        `<b>Adresse:</b> ${job.address || "Ikke angitt"}`,
        job.description ? `<b>Beskrivelse:</b> ${job.description}` : null,
        `<br/><a href="${jobLink}">Åpne jobb i systemet</a>`,
      ].filter(Boolean).join("<br/>");

      const results: any[] = [];

      for (const tech of techs || []) {
        const techLog = (msg: string) => log(`[${tech.name}] ${msg}`);

        // Get token for this technician's user
        const msToken = await ensureValidMsToken(supabaseAdmin, tech.user_id, techLog);
        if (!msToken) {
          techLog("No valid MS token, skipping");
          await supabaseAdmin.from("job_calendar_links").upsert({
            job_id,
            user_id: tech.user_id,
            technician_id: tech.id,
            provider: "microsoft",
            sync_status: "failed",
            last_error: "Ingen gyldig Microsoft-token. Brukeren må logge inn på nytt.",
          }, { onConflict: "job_id,technician_id" });
          results.push({ technician_id: tech.id, name: tech.name, status: "failed", error: "no_token" });
          continue;
        }

        // Check for existing calendar link
        const { data: existingLink } = await supabaseAdmin
          .from("job_calendar_links")
          .select("*")
          .eq("job_id", job_id)
          .eq("technician_id", tech.id)
          .maybeSingle();

        const eventPayload = {
          subject,
          body: { contentType: "HTML", content: htmlBody },
          start: { dateTime: job.start_time, timeZone: "Europe/Oslo" },
          end: { dateTime: job.end_time, timeZone: "Europe/Oslo" },
          location: job.address ? { displayName: job.address } : undefined,
        };

        if (existingLink?.calendar_event_id) {
          // PATCH existing event
          techLog(`Updating existing event ${existingLink.calendar_event_id.slice(0, 20)}...`);
          const patchRes = await fetch(
            `${GRAPH_BASE}/me/events/${existingLink.calendar_event_id}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${msToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(eventPayload),
            }
          );

          if (patchRes.ok) {
            const patchData = await patchRes.json();
            techLog(`Event updated successfully`);
            await supabaseAdmin.from("job_calendar_links").update({
              sync_status: "linked",
              last_synced_at: new Date().toISOString(),
              last_error: null,
              calendar_event_url: patchData.webLink || existingLink.calendar_event_url,
            }).eq("id", existingLink.id);
            results.push({ technician_id: tech.id, name: tech.name, status: "updated", event_id: existingLink.calendar_event_id });
          } else {
            const errText = await patchRes.text();
            techLog(`PATCH failed: ${patchRes.status} ${errText.substring(0, 200)}`);
            // If 404, event was deleted — create new
            if (patchRes.status === 404) {
              techLog("Event not found, creating new...");
              // Fall through to create below
            } else {
              await supabaseAdmin.from("job_calendar_links").update({
                sync_status: "failed",
                last_error: `PATCH ${patchRes.status}: ${errText.substring(0, 200)}`,
              }).eq("id", existingLink.id);
              results.push({ technician_id: tech.id, name: tech.name, status: "failed", error: `PATCH ${patchRes.status}` });
              continue;
            }
          }

          // Only reach here if PATCH returned 404
          if (!patchRes.ok) {
            // Create new event
            const createRes = await fetch(`${GRAPH_BASE}/me/events`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${msToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(eventPayload),
            });

            if (createRes.ok) {
              const createData = await createRes.json();
              techLog(`New event created: ${createData.id?.slice(0, 20)}`);
              await supabaseAdmin.from("job_calendar_links").update({
                calendar_event_id: createData.id,
                calendar_event_url: createData.webLink || null,
                sync_status: "linked",
                last_synced_at: new Date().toISOString(),
                last_error: null,
              }).eq("id", existingLink.id);
              results.push({ technician_id: tech.id, name: tech.name, status: "created", event_id: createData.id });
            } else {
              const errText = await createRes.text();
              techLog(`Create failed: ${createRes.status}`);
              await supabaseAdmin.from("job_calendar_links").update({
                sync_status: "failed",
                last_error: `POST ${createRes.status}: ${errText.substring(0, 200)}`,
              }).eq("id", existingLink.id);
              results.push({ technician_id: tech.id, name: tech.name, status: "failed", error: `POST ${createRes.status}` });
            }
          }
        } else {
          // CREATE new event
          techLog("Creating new Outlook event...");
          const createRes = await fetch(`${GRAPH_BASE}/me/events`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${msToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(eventPayload),
          });

          if (createRes.ok) {
            const createData = await createRes.json();
            techLog(`Event created: ${createData.id?.slice(0, 20)}`);
            await supabaseAdmin.from("job_calendar_links").upsert({
              job_id,
              user_id: tech.user_id,
              technician_id: tech.id,
              provider: "microsoft",
              calendar_event_id: createData.id,
              calendar_event_url: createData.webLink || null,
              sync_status: "linked",
              last_synced_at: new Date().toISOString(),
              last_error: null,
            }, { onConflict: "job_id,technician_id" });
            results.push({ technician_id: tech.id, name: tech.name, status: "created", event_id: createData.id });
          } else {
            const errText = await createRes.text();
            techLog(`Create failed: ${createRes.status} ${errText.substring(0, 200)}`);
            await supabaseAdmin.from("job_calendar_links").upsert({
              job_id,
              user_id: tech.user_id,
              technician_id: tech.id,
              provider: "microsoft",
              sync_status: "failed",
              last_error: `POST ${createRes.status}: ${errText.substring(0, 200)}`,
            }, { onConflict: "job_id,technician_id" });
            results.push({ technician_id: tech.id, name: tech.name, status: "failed", error: `POST ${createRes.status}` });
          }
        }
      }

      // Log action
      const successCount = results.filter((r: any) => r.status !== "failed").length;
      await supabaseAdmin.from("event_logs").insert({
        event_id: job_id,
        action_type: "outlook_calendar_sync",
        performed_by: authUser.id,
        change_summary: `Outlook-synk: ${successCount}/${results.length} teknikere synkronisert`,
      });

      return respond({ results, logs });
    }

    // ─── ACTION: unlink_job_events ───
    if (action === "unlink_job_events") {
      const { job_id, user_ids } = body;
      if (!job_id) return respond({ error: "Missing job_id", logs }, 400);

      // Get links to remove
      let query = supabaseAdmin
        .from("job_calendar_links")
        .select("*, technicians(email, name, user_id)")
        .eq("job_id", job_id);

      if (user_ids?.length) {
        query = query.in("user_id", user_ids);
      }

      const { data: links } = await query;
      const results: any[] = [];

      for (const link of links || []) {
        const tech = link.technicians;
        const techLog = (msg: string) => log(`[${tech?.name || link.user_id}] ${msg}`);

        if (link.calendar_event_id && tech?.user_id) {
          const msToken = await ensureValidMsToken(supabaseAdmin, tech.user_id, techLog);
          if (msToken) {
            techLog(`Deleting event ${link.calendar_event_id.slice(0, 20)}...`);
            const delRes = await fetch(
              `${GRAPH_BASE}/me/events/${link.calendar_event_id}`,
              {
                method: "DELETE",
                headers: { Authorization: `Bearer ${msToken}` },
              }
            );
            techLog(`Delete: ${delRes.status} ${delRes.ok || delRes.status === 404 ? "OK" : "FAILED"}`);
            // Consume body
            await delRes.text();
          } else {
            techLog("No token, cannot delete Outlook event");
          }
        }

        // Update link status
        await supabaseAdmin.from("job_calendar_links").update({
          sync_status: "unlinked",
          calendar_event_id: null,
          calendar_event_url: null,
          last_error: null,
        }).eq("id", link.id);

        results.push({ technician_id: link.technician_id, name: tech?.name, status: "unlinked" });
      }

      await supabaseAdmin.from("event_logs").insert({
        event_id: job_id,
        action_type: "outlook_calendar_unlinked",
        performed_by: authUser.id,
        change_summary: `Outlook-hendelser fjernet for ${results.length} tekniker(e)`,
      });

      return respond({ results, logs });
    }

    return respond({ error: "Unknown action", logs }, 400);
  } catch (err) {
    console.error("[ms-calendar] Exception:", err);
    return respond({ error: "Internal server error", details: String(err) }, 500);
  }
});
