import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function graphErrorMessage(status: number, _code?: string): string {
  if (status === 401) return "Microsoft-token feilet. Sjekk client secret og tenant.";
  if (status === 403) return "Appen mangler rettigheter til SharePoint-området eller drive. Sjekk Graph permissions og site-tilgang.";
  if (status === 404) return "Fant ikke ressursen i SharePoint. Sjekk at mappen finnes i riktig dokumentbibliotek.";
  if (status === 429) return "For mange forespørsler mot Microsoft. Prøv igjen om litt.";
  if (status >= 500) return "Microsoft/Graph midlertidig feil. Prøv igjen.";
  return `SharePoint-feil (HTTP ${status})`;
}

async function getAppToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${Deno.env.get("AZURE_TENANT_ID")}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("AZURE_CLIENT_ID")!,
        client_secret: Deno.env.get("AZURE_CLIENT_SECRET")!,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token fetch failed: ${res.status} ${err.substring(0, 200)}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function graphFetch(token: string, url: string, init?: RequestInit) {
  return fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers } });
}

// ── Pick the best drive from a list ──
function pickBestDrive(drives: any[]): any | null {
  // Priority: name == "Dokumenter" > "Documents" > webUrl contains /Dokumenter or Shared Documents > first
  const byName = (n: string) => drives.find((d: any) => d.name === n);
  const byUrl = (sub: string) => drives.find((d: any) => (d.webUrl || "").includes(sub));
  return byName("Dokumenter") || byName("Documents") || byUrl("/Dokumenter") || byUrl("Shared Documents") || drives[0] || null;
}

// ── Verify / auto-heal company SharePoint config ──
// Returns { site_id, drive_id, base_path, healed: boolean, healSummary?: string } or throws
interface SpConfig {
  id: string;
  sharepoint_site_id: string | null;
  sharepoint_drive_id: string | null;
  sharepoint_base_path: string | null;
}

interface VerifyResult {
  site_id: string;
  drive_id: string;
  base_path: string;
  healed: boolean;
  healSummary?: string;
  drive_name?: string;
  drive_webUrl?: string;
}

async function verifyConfig(
  supabaseAdmin: any,
  msToken: string,
  spConfig: SpConfig,
  requestId: string,
): Promise<VerifyResult> {
  let siteId = spConfig.sharepoint_site_id || "";
  let driveId = spConfig.sharepoint_drive_id || "";
  let basePath = (spConfig.sharepoint_base_path || "").replace(/^\/+|\/+$/g, "");
  let healed = false;
  const healParts: string[] = [];

  // Step 1: If site_id missing, resolve it from known hostname/path
  if (!siteId) {
    const siteHostname = "mcselektrotavler.sharepoint.com";
    const sitePath = "/sites/BCDokumentarkiv";
    const siteUrl = `${GRAPH_BASE}/sites/${siteHostname}:${sitePath}`;
    console.log(`[verify_config] request_id=${requestId} resolving site from ${siteUrl}`);
    const siteRes = await graphFetch(msToken, siteUrl);
    if (!siteRes.ok) {
      const st = siteRes.status;
      await siteRes.text();
      throw { step: "verify_resolve_site", graph_status: st, message: graphErrorMessage(st) };
    }
    const siteData = await siteRes.json();
    siteId = siteData.id;
    healed = true;
    healParts.push(`Site: ${siteData.displayName || siteId}`);
  }

  // Step 2: Resolve / verify drive_id
  const drivesUrl = `${GRAPH_BASE}/sites/${siteId}/drives`;
  console.log(`[verify_config] request_id=${requestId} listing drives`);
  const drivesRes = await graphFetch(msToken, drivesUrl);
  if (!drivesRes.ok) {
    const st = drivesRes.status;
    await drivesRes.text();
    throw { step: "verify_drives", graph_status: st, message: graphErrorMessage(st) };
  }
  const drivesData = await drivesRes.json();
  const allDrives = drivesData.value || [];

  const bestDrive = pickBestDrive(allDrives);
  if (!bestDrive) {
    throw { step: "verify_drives", graph_status: 404, message: "Fant ingen dokumentbibliotek på SharePoint-området." };
  }

  if (!driveId || driveId !== bestDrive.id) {
    // Check if current driveId is still valid
    const currentValid = driveId && allDrives.some((d: any) => d.id === driveId);
    if (!currentValid) {
      driveId = bestDrive.id;
      healed = true;
      healParts.push(`Drive: ${bestDrive.name}`);
    }
  }

  // Step 3: Verify base_path exists
  if (!basePath) basePath = "Drift";
  const alternativePaths = ["Drift", "drift", "Prosjekter/Drift", "Dokumenter/Drift"];

  let basePathValid = false;
  const pathUrl = `${GRAPH_BASE}/drives/${driveId}/root:/${encodeURIComponent(basePath).replace(/%2F/g, "/")}`;
  console.log(`[verify_config] request_id=${requestId} checking base_path="${basePath}"`);
  const pathRes = await graphFetch(msToken, pathUrl);
  if (pathRes.ok) {
    const item = await pathRes.json();
    if (item.folder) basePathValid = true;
    else await Promise.resolve(); // consumed
  } else {
    await pathRes.text(); // consume
  }

  if (!basePathValid) {
    // Try alternatives
    for (const alt of alternativePaths) {
      if (alt === basePath) continue;
      const altUrl = `${GRAPH_BASE}/drives/${driveId}/root:/${encodeURIComponent(alt).replace(/%2F/g, "/")}`;
      console.log(`[verify_config] request_id=${requestId} trying alt base_path="${alt}"`);
      const altRes = await graphFetch(msToken, altUrl);
      if (altRes.ok) {
        const altItem = await altRes.json();
        if (altItem.folder) {
          basePath = alt;
          basePathValid = true;
          healed = true;
          healParts.push(`Base: ${alt}`);
          break;
        }
      } else {
        await altRes.text(); // consume
      }
    }

    if (!basePathValid) {
      throw {
        step: "verify_base_path",
        graph_status: 404,
        message: `Rot-mappen "${basePath}" finnes ikke i dette dokumentbiblioteket. Prøvde også: ${alternativePaths.join(", ")}`,
      };
    }
  }

  // Step 4: Persist healed config
  if (healed) {
    console.log(`[verify_config] request_id=${requestId} saving healed config site=${siteId} drive=${driveId} base=${basePath}`);
    await supabaseAdmin
      .from("company_settings")
      .update({
        sharepoint_site_id: siteId,
        sharepoint_drive_id: driveId,
        sharepoint_base_path: basePath,
      })
      .eq("id", spConfig.id);
  }

  return {
    site_id: siteId,
    drive_id: driveId,
    base_path: basePath,
    healed,
    healSummary: healParts.length > 0 ? healParts.join(", ") : undefined,
    drive_name: bestDrive?.name,
    drive_webUrl: bestDrive?.webUrl,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  const respond = (data: Record<string, unknown>, status = 200) =>
    jsonResponse({ ...data, request_id: requestId }, status);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return respond({ error: "Unauthorized" }, 401);

    const jwt = authHeader.replace("Bearer ", "");
    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(jwt);
    if (userErr || !userData?.user) return respond({ error: "Invalid session" }, 401);
    const userId = userData.user.id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json().catch(() => ({}));
    const { action, job_id, project_code, folder_id, company_id } = body;

    console.log(`[sharepoint-connect] request_id=${requestId} action=${action} job_id=${job_id} project_code=${project_code} company_id=${company_id}`);

    // ── Helper: load company SharePoint config ──
    async function loadSpConfig(): Promise<SpConfig | null> {
      const { data } = await supabaseAdmin
        .from("company_settings")
        .select("id, sharepoint_site_id, sharepoint_drive_id, sharepoint_base_path")
        .limit(1)
        .maybeSingle();
      return data as SpConfig | null;
    }

    // ── SEARCH ──
    if (action === "search") {
      try {
        const code = (project_code || "").trim().toUpperCase().replace(/\s+/g, "");
        if (!code) return respond({ error: "project_code required" }, 400);

        const spConfig = await loadSpConfig();
        if (!spConfig) {
          return respond({ error: "Ingen firmainnstillinger funnet. Opprett dem først.", step: "config" }, 400);
        }

        // Get MS token
        let msToken: string;
        try {
          msToken = await getAppToken();
        } catch (e: any) {
          console.error(`[sharepoint-connect] request_id=${requestId} step=token error=${e.message}`);
          return respond({ error: "Microsoft-token feilet.", graph_status: 401, step: "token" }, 502);
        }

        // Auto-heal: verify and fix config
        let verified: VerifyResult;
        try {
          verified = await verifyConfig(supabaseAdmin, msToken, spConfig, requestId);
        } catch (vErr: any) {
          console.error(`[sharepoint-connect] request_id=${requestId} verify_config failed:`, vErr.message || vErr);
          return respond({
            error: vErr.message || "Konfig-verifisering feilet",
            step: vErr.step || "verify_config",
            graph_status: vErr.graph_status || null,
            debug: {
              site_id: spConfig.sharepoint_site_id,
              drive_id: spConfig.sharepoint_drive_id,
              base_path: spConfig.sharepoint_base_path,
            },
          }, 502);
        }

        const { site_id: siteId, drive_id: driveId, base_path: basePath } = verified;

        // Strategy 1: Direct path lookup
        const attemptedPath = basePath ? `${basePath}/${code}` : code;
        const pathUrl = `${GRAPH_BASE}/drives/${driveId}/root:/${encodeURIComponent(attemptedPath).replace(/%2F/g, "/")}`;
        console.log(`[sharepoint-connect] request_id=${requestId} step=path_lookup url=${pathUrl}`);

        const pathRes = await graphFetch(msToken, pathUrl);

        if (pathRes.ok) {
          const item = await pathRes.json();
          if (item.folder) {
            return respond({
              folders: [{
                id: item.id,
                name: item.name,
                webUrl: item.webUrl,
                siteId,
                driveId,
                lastModified: item.lastModifiedDateTime,
              }],
              source: "direct_path",
              attempted_path: attemptedPath,
              config_healed: verified.healed,
              heal_summary: verified.healSummary,
              debug: { site_id: siteId, drive_id: driveId, base_path: basePath, drive_name: verified.drive_name, drive_webUrl: verified.drive_webUrl, attempted_path: attemptedPath },
            });
          }
          // file, not folder — fall through
        } else {
          const status = pathRes.status;
          await pathRes.text();
          if (status !== 404) {
            console.error(`[sharepoint-connect] request_id=${requestId} step=path_lookup graph_status=${status}`);
            return respond({
              error: graphErrorMessage(status),
              graph_status: status,
              step: "path_lookup",
              debug: { site_id: siteId, drive_id: driveId, base_path: basePath, attempted_path: attemptedPath, drive_name: verified.drive_name, drive_webUrl: verified.drive_webUrl },
            }, 502);
          }
        }

        // Strategy 2: Search within drive
        const searchUrl = `${GRAPH_BASE}/sites/${siteId}/drives/${driveId}/root/search(q='${encodeURIComponent(code)}')`;
        console.log(`[sharepoint-connect] request_id=${requestId} step=search_fallback url=${searchUrl}`);
        const searchRes = await graphFetch(msToken, searchUrl);

        if (!searchRes.ok) {
          const errBody = await searchRes.json().catch(() => ({}));
          const errCode = errBody?.error?.code || "";
          console.error(`[sharepoint-connect] request_id=${requestId} step=search graph_status=${searchRes.status} graph_error_code=${errCode}`);
          return respond({
            error: graphErrorMessage(searchRes.status, errCode),
            graph_status: searchRes.status,
            graph_error_code: errCode,
            step: "search",
            debug: { site_id: siteId, drive_id: driveId, base_path: basePath, attempted_path: attemptedPath },
          }, 502);
        }

        const searchData = await searchRes.json();
        const items = searchData.value || [];

        const basePathLower = basePath.toLowerCase();
        const folders = items
          .filter((item: any) => {
            if (!item.folder) return false;
            if (!basePath) return true;
            const parentPath = (item.parentReference?.path || "").toLowerCase();
            return parentPath.includes(`:/${basePathLower}`) || parentPath.includes(`:/${basePathLower}/`);
          })
          .map((item: any) => ({
            id: item.id,
            name: item.name,
            webUrl: item.webUrl,
            siteId,
            driveId,
            lastModified: item.lastModifiedDateTime,
            parentPath: item.parentReference?.path || "",
          }))
          .sort((a: any, b: any) => {
            const aExact = a.name.toUpperCase() === code ? 0 : 1;
            const bExact = b.name.toUpperCase() === code ? 0 : 1;
            if (aExact !== bExact) return aExact - bExact;
            const aPrefix = a.name.toUpperCase().startsWith(code) ? 0 : 1;
            const bPrefix = b.name.toUpperCase().startsWith(code) ? 0 : 1;
            return aPrefix - bPrefix;
          })
          .slice(0, 10);

        if (folders.length === 0) {
          return respond({
            error: `Fant ikke "${code}" under ${basePath || "rot"}.`,
            graph_status: 404,
            graph_error_code: "itemNotFound",
            step: "search",
            folders: [],
            config_healed: verified.healed,
            heal_summary: verified.healSummary,
            debug: { site_id: siteId, drive_id: driveId, base_path: basePath, attempted_path: attemptedPath, drive_name: verified.drive_name, drive_webUrl: verified.drive_webUrl },
          }, 200);
        }

        return respond({
          folders,
          source: "drive_search",
          attempted_path: attemptedPath,
          config_healed: verified.healed,
          heal_summary: verified.healSummary,
          debug: { site_id: siteId, drive_id: driveId, base_path: basePath, drive_name: verified.drive_name, drive_webUrl: verified.drive_webUrl },
        });
      } catch (searchErr: any) {
        console.error(`[sharepoint-connect] request_id=${requestId} action=search unhandled:`, searchErr.message || searchErr);
        return respond({ error: searchErr.message || "Søk feilet", step: "search" }, 500);
      }
    }

    // ── CONNECT ──
    if (action === "connect") {
      try {
        if (!job_id || !folder_id) return respond({ error: "job_id and folder_id required" }, 400);

        const webUrl = body.web_url || null;
        const siteId = body.site_id || null;
        const driveId = body.drive_id || null;

        const { error: updateErr } = await supabaseAdmin
          .from("events")
          .update({
            sharepoint_project_code: (project_code || "").trim().toUpperCase().replace(/\s+/g, "") || null,
            sharepoint_site_id: siteId,
            sharepoint_drive_id: driveId,
            sharepoint_folder_id: folder_id,
            sharepoint_folder_web_url: webUrl,
            sharepoint_connected_at: new Date().toISOString(),
          })
          .eq("id", job_id);

        if (updateErr) {
          console.error(`[sharepoint-connect] request_id=${requestId} step=connect error=${updateErr.message}`);
          return respond({ error: "Kunne ikke lagre kobling", detail: updateErr.message }, 500);
        }

        await supabaseAdmin.from("event_logs").insert({
          event_id: job_id,
          action_type: "sharepoint_connected",
          performed_by: userId,
          change_summary: `SharePoint-mappe koblet: ${project_code || folder_id}`,
        }).catch(() => {});

        return respond({ success: true });
      } catch (connectErr: any) {
        console.error(`[sharepoint-connect] request_id=${requestId} action=connect unhandled:`, connectErr.message);
        return respond({ error: connectErr.message || "Kobling feilet", step: "connect" }, 500);
      }
    }

    // ── DISCONNECT ──
    if (action === "disconnect") {
      try {
        if (!job_id) return respond({ error: "job_id required" }, 400);

        await supabaseAdmin
          .from("events")
          .update({
            sharepoint_project_code: null,
            sharepoint_site_id: null,
            sharepoint_drive_id: null,
            sharepoint_folder_id: null,
            sharepoint_folder_web_url: null,
            sharepoint_connected_at: null,
          })
          .eq("id", job_id);

        await supabaseAdmin.from("event_logs").insert({
          event_id: job_id,
          action_type: "sharepoint_disconnected",
          performed_by: userId,
          change_summary: "SharePoint-kobling fjernet",
        }).catch(() => {});

        return respond({ success: true });
      } catch (disconnectErr: any) {
        console.error(`[sharepoint-connect] request_id=${requestId} action=disconnect unhandled:`, disconnectErr.message);
        return respond({ error: disconnectErr.message || "Frakobling feilet", step: "disconnect" }, 500);
      }
    }

    // ── RESOLVE_SITE ──
    if (action === "resolve_site") {
      try {
        const siteHostname = (body.site_hostname || "").trim();
        const sitePath = (body.site_path || "").trim();
        const basePath = (body.base_path || "").trim();

        if (!siteHostname || !sitePath) {
          return respond({ error: "site_hostname og site_path er påkrevd (f.eks. 'mcselektrotavler.sharepoint.com' og '/sites/BCDokumentarkiv')" }, 400);
        }

        let msToken: string;
        try {
          msToken = await getAppToken();
        } catch (e: any) {
          console.error(`[sharepoint-connect] request_id=${requestId} step=token error=${e.message}`);
          return respond({ error: "Microsoft-token feilet.", graph_status: 401, step: "token" }, 502);
        }

        // Resolve site
        const siteUrl = `${GRAPH_BASE}/sites/${siteHostname}:${sitePath}`;
        console.log(`[sharepoint-connect] request_id=${requestId} step=resolve_site url=${siteUrl}`);
        const siteRes = await graphFetch(msToken, siteUrl);

        if (!siteRes.ok) {
          const status = siteRes.status;
          await siteRes.text();
          return respond({
            error: graphErrorMessage(status),
            graph_status: status,
            step: "resolve_site",
          }, 502);
        }

        const siteData = await siteRes.json();
        const resolvedSiteId = siteData.id;

        // Get drives
        const drivesUrl = `${GRAPH_BASE}/sites/${resolvedSiteId}/drives`;
        console.log(`[sharepoint-connect] request_id=${requestId} step=resolve_drives url=${drivesUrl}`);
        const drivesRes = await graphFetch(msToken, drivesUrl);

        if (!drivesRes.ok) {
          const status = drivesRes.status;
          await drivesRes.text();
          return respond({
            error: graphErrorMessage(status),
            graph_status: status,
            step: "resolve_drives",
            site_id: resolvedSiteId,
          }, 502);
        }

        const drivesData = await drivesRes.json();
        const drives = (drivesData.value || []).map((d: any) => ({
          id: d.id,
          name: d.name,
          webUrl: d.webUrl,
          driveType: d.driveType,
        }));

        const defaultDrive = pickBestDrive(drivesData.value || []);

        if (!defaultDrive) {
          return respond({ error: "Fant ingen dokumentbibliotek på dette SharePoint-området.", step: "resolve_drives", site_id: resolvedSiteId }, 404);
        }

        // Save to company_settings
        const spConfig = await loadSpConfig();
        const settingsId = spConfig?.id;

        if (!settingsId) {
          return respond({ error: "Ingen firmainnstillinger funnet. Opprett dem først.", step: "save" }, 400);
        }

        const { error: saveErr } = await supabaseAdmin
          .from("company_settings")
          .update({
            sharepoint_site_id: resolvedSiteId,
            sharepoint_drive_id: defaultDrive.id,
            sharepoint_base_path: basePath || null,
          })
          .eq("id", settingsId);

        if (saveErr) {
          console.error(`[sharepoint-connect] request_id=${requestId} step=save error=${saveErr.message}`);
          return respond({ error: "Kunne ikke lagre konfigurasjon", detail: saveErr.message, step: "save" }, 500);
        }

        return respond({
          success: true,
          site_id: resolvedSiteId,
          site_name: siteData.displayName,
          site_web_url: siteData.webUrl,
          drive_id: defaultDrive.id,
          drive_name: defaultDrive.name,
          drives,
          base_path: basePath || null,
        });
      } catch (resolveErr: any) {
        console.error(`[sharepoint-connect] request_id=${requestId} action=resolve_site unhandled:`, resolveErr.message);
        return respond({ error: resolveErr.message || "Site-oppslag feilet", step: "resolve_site" }, 500);
      }
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error(`[sharepoint-connect] request_id=${requestId} top-level error:`, err.message);
    return jsonResponse({ error: err.message || "Internal error", step: "unknown", request_id: requestId }, 500);
  }
});
