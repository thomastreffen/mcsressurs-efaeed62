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

function pickBestDrive(drives: any[]): any | null {
  const byName = (n: string) => drives.find((d: any) => d.name === n);
  const byUrl = (sub: string) => drives.find((d: any) => (d.webUrl || "").includes(sub));
  return byName("Dokumenter") || byName("Documents") || byUrl("/Dokumenter") || byUrl("Shared Documents") || drives[0] || null;
}

// ── RBAC helpers ──
async function checkPermission(supabaseAdmin: any, authUserId: string, perm: string): Promise<boolean> {
  const { data } = await supabaseAdmin.rpc("check_permission_v2", {
    _auth_user_id: authUserId,
    _perm: perm,
  });
  return data === true;
}

async function checkRecordAccess(supabaseAdmin: any, authUserId: string, job: any): Promise<boolean> {
  const { data } = await supabaseAdmin.rpc("can_access_record_v2", {
    _auth_user_id: authUserId,
    _record_company_id: job.company_id,
    _record_department_id: job.department_id || null,
    _record_created_by: job.created_by || null,
    _record_id: job.id,
  });
  return data === true;
}

// ── Lookup job + validate access ──
interface JobContext {
  id: string;
  company_id: string;
  department_id: string | null;
  created_by: string | null;
  sharepoint_folder_id: string | null;
  sharepoint_drive_id: string | null;
  sharepoint_site_id: string | null;
  sharepoint_folder_web_url: string | null;
  sharepoint_project_code: string | null;
}

async function loadJob(supabaseAdmin: any, jobId: string): Promise<JobContext | null> {
  const { data } = await supabaseAdmin
    .from("events")
    .select("id, company_id, department_id, created_by, sharepoint_folder_id, sharepoint_drive_id, sharepoint_site_id, sharepoint_folder_web_url, sharepoint_project_code")
    .eq("id", jobId)
    .single();
  return data as JobContext | null;
}

// ── Audit log helper ──
async function auditLog(supabaseAdmin: any, authUserId: string, action: string, targetId: string | null, targetType: string, metadata: Record<string, unknown> = {}) {
  try {
    // Get user_account_id for audit_log
    const { data: uaId } = await supabaseAdmin.rpc("get_user_account_id", { _auth_user_id: authUserId });
    await supabaseAdmin.from("audit_log").insert({
      action,
      actor_user_account_id: uaId || null,
      target_id: targetId,
      target_type: targetType,
      metadata,
    });
  } catch (_) { /* non-critical */ }
}

// ── SpConfig ──
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
    const currentValid = driveId && allDrives.some((d: any) => d.id === driveId);
    if (!currentValid) {
      driveId = bestDrive.id;
      healed = true;
      healParts.push(`Drive: ${bestDrive.name}`);
    }
  }

  if (!basePath) basePath = "Drift";
  const alternativePaths = ["Drift", "drift", "Prosjekter/Drift", "Dokumenter/Drift"];

  let basePathValid = false;
  const pathUrl = `${GRAPH_BASE}/drives/${driveId}/root:/${encodeURIComponent(basePath).replace(/%2F/g, "/")}`;
  console.log(`[verify_config] request_id=${requestId} checking base_path="${basePath}"`);
  const pathRes = await graphFetch(msToken, pathUrl);
  if (pathRes.ok) {
    const item = await pathRes.json();
    if (item.folder) basePathValid = true;
  } else {
    await pathRes.text();
  }

  if (!basePathValid) {
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
        await altRes.text();
      }
    }

    if (!basePathValid) {
      throw {
        step: "verify_base_path",
        graph_status: 404,
        message: `Rot-mappen "${basePath}" finnes ikke. Prøvde også: ${alternativePaths.join(", ")}`,
      };
    }
  }

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
    const authUserId = userData.user.id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json().catch(() => ({}));
    const { action, job_id, project_code, folder_id } = body;

    console.log(`[sharepoint-connect] request_id=${requestId} action=${action} job_id=${job_id}`);

    // ── Helper: load company SharePoint config by company_id ──
    async function loadSpConfig(companyId?: string): Promise<SpConfig | null> {
      const q = supabaseAdmin
        .from("company_settings")
        .select("id, sharepoint_site_id, sharepoint_drive_id, sharepoint_base_path");
      // company_settings is a singleton — just get first row
      const { data } = await q.limit(1).maybeSingle();
      return data as SpConfig | null;
    }

    // ── SEARCH ──
    // Requires: job_id + project_code. Resolves company from job server-side.
    if (action === "search") {
      try {
        const code = (project_code || "").trim().toUpperCase().replace(/\s+/g, "");
        if (!code) return respond({ error: "project_code required" }, 400);
        if (!job_id) return respond({ error: "job_id required" }, 400);

        // Load job server-side
        const job = await loadJob(supabaseAdmin, job_id);
        if (!job) return respond({ error: "Jobb ikke funnet", step: "lookup" }, 404);

        // RBAC: check scope access
        const hasAccess = await checkRecordAccess(supabaseAdmin, authUserId, job);
        if (!hasAccess) {
          return respond({ error: "Du mangler tilgang til SharePoint for dette selskapet.", step: "rbac" }, 403);
        }

        // RBAC: check permission
        const canView = await checkPermission(supabaseAdmin, authUserId, "sharepoint.view");
        const canLink = await checkPermission(supabaseAdmin, authUserId, "sharepoint.link_job");
        if (!canView && !canLink) {
          return respond({ error: "Du mangler SharePoint-rettigheter.", step: "rbac" }, 403);
        }

        const spConfig = await loadSpConfig();
        if (!spConfig) {
          return respond({ error: "Ingen firmainnstillinger funnet. Opprett dem først.", step: "config" }, 400);
        }

        let msToken: string;
        try {
          msToken = await getAppToken();
        } catch (e: any) {
          console.error(`[sharepoint-connect] request_id=${requestId} step=token error=${e.message}`);
          return respond({ error: "Microsoft-token feilet.", graph_status: 401, step: "token" }, 502);
        }

        // Self-heal: only if config is incomplete AND user is admin
        let verified: VerifyResult;
        const configIncomplete = !spConfig.sharepoint_site_id || !spConfig.sharepoint_drive_id;
        if (configIncomplete) {
          const isAdmin = await checkPermission(supabaseAdmin, authUserId, "sharepoint.admin");
          if (!isAdmin) {
            return respond({
              error: "SharePoint-konfigurasjon mangler. Kontakt administrator.",
              step: "config",
            }, 400);
          }
          try {
            verified = await verifyConfig(supabaseAdmin, msToken, spConfig, requestId);
            // Audit log the self-heal
            await auditLog(supabaseAdmin, authUserId, "sharepoint_config_healed", spConfig.id, "company_settings", {
              heal_summary: verified.healSummary,
              site_id: verified.site_id,
              drive_id: verified.drive_id,
              base_path: verified.base_path,
            });
          } catch (vErr: any) {
            console.error(`[sharepoint-connect] request_id=${requestId} verify_config failed:`, vErr.message || vErr);
            return respond({
              error: vErr.message || "Konfig-verifisering feilet",
              step: vErr.step || "verify_config",
              graph_status: vErr.graph_status || null,
              debug: { site_id: spConfig.sharepoint_site_id, drive_id: spConfig.sharepoint_drive_id, base_path: spConfig.sharepoint_base_path },
            }, 502);
          }
        } else {
          verified = {
            site_id: spConfig.sharepoint_site_id!,
            drive_id: spConfig.sharepoint_drive_id!,
            base_path: (spConfig.sharepoint_base_path || "Drift").replace(/^\/+|\/+$/g, ""),
            healed: false,
          };
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
        } else {
          const status = pathRes.status;
          await pathRes.text();
          if (status !== 404) {
            return respond({
              error: graphErrorMessage(status),
              graph_status: status,
              step: "path_lookup",
              debug: { site_id: siteId, drive_id: driveId, base_path: basePath, attempted_path: attemptedPath },
            }, 502);
          }
        }

        // Strategy 2: Search within drive
        const searchUrl = `${GRAPH_BASE}/sites/${siteId}/drives/${driveId}/root/search(q='${encodeURIComponent(code)}')`;
        console.log(`[sharepoint-connect] request_id=${requestId} step=search_fallback`);
        const searchRes = await graphFetch(msToken, searchUrl);

        if (!searchRes.ok) {
          const errBody = await searchRes.json().catch(() => ({}));
          const errCode = errBody?.error?.code || "";
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
            debug: { site_id: siteId, drive_id: driveId, base_path: basePath, attempted_path: attemptedPath },
          }, 200);
        }

        return respond({
          folders,
          source: "drive_search",
          attempted_path: attemptedPath,
          config_healed: verified.healed,
          heal_summary: verified.healSummary,
          debug: { site_id: siteId, drive_id: driveId, base_path: basePath },
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

        const job = await loadJob(supabaseAdmin, job_id);
        if (!job) return respond({ error: "Jobb ikke funnet", step: "lookup" }, 404);

        const hasAccess = await checkRecordAccess(supabaseAdmin, authUserId, job);
        if (!hasAccess) return respond({ error: "Du mangler tilgang til denne jobben.", step: "rbac" }, 403);

        const canLink = await checkPermission(supabaseAdmin, authUserId, "sharepoint.link_job");
        if (!canLink) return respond({ error: "Du mangler rettighet til å koble SharePoint-mapper.", step: "rbac" }, 403);

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
          return respond({ error: "Kunne ikke lagre kobling", detail: updateErr.message, step: "connect" }, 500);
        }

        // Audit log
        await auditLog(supabaseAdmin, authUserId, "sharepoint_connected", job_id, "event", {
          project_code: project_code || folder_id,
          folder_id,
          drive_id: driveId,
        });

        try {
          await supabaseAdmin.from("event_logs").insert({
            event_id: job_id,
            action_type: "sharepoint_connected",
            performed_by: authUserId,
            change_summary: `SharePoint-mappe koblet: ${project_code || folder_id}`,
          });
        } catch (_) { /* non-critical */ }

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

        const job = await loadJob(supabaseAdmin, job_id);
        if (!job) return respond({ error: "Jobb ikke funnet", step: "lookup" }, 404);

        const hasAccess = await checkRecordAccess(supabaseAdmin, authUserId, job);
        if (!hasAccess) return respond({ error: "Du mangler tilgang til denne jobben.", step: "rbac" }, 403);

        const canLink = await checkPermission(supabaseAdmin, authUserId, "sharepoint.link_job");
        if (!canLink) return respond({ error: "Du mangler rettighet til å koble fra SharePoint-mapper.", step: "rbac" }, 403);

        const { error: updateErr } = await supabaseAdmin
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

        if (updateErr) {
          return respond({ error: "Kunne ikke fjerne kobling", detail: updateErr.message, step: "disconnect" }, 500);
        }

        await auditLog(supabaseAdmin, authUserId, "sharepoint_disconnected", job_id, "event", {
          previous_code: job.sharepoint_project_code,
        });

        try {
          await supabaseAdmin.from("event_logs").insert({
            event_id: job_id,
            action_type: "sharepoint_disconnected",
            performed_by: authUserId,
            change_summary: "SharePoint-kobling fjernet",
          });
        } catch (_) { /* non-critical */ }

        return respond({ success: true });
      } catch (disconnectErr: any) {
        console.error(`[sharepoint-connect] request_id=${requestId} action=disconnect unhandled:`, disconnectErr.message);
        return respond({ error: disconnectErr.message || "Frakobling feilet", step: "disconnect" }, 500);
      }
    }

    // ── RESOLVE_SITE ── (admin only)
    if (action === "resolve_site") {
      try {
        const isAdmin = await checkPermission(supabaseAdmin, authUserId, "sharepoint.admin");
        if (!isAdmin) {
          return respond({ error: "Kun administratorer kan konfigurere SharePoint-integrasjon.", step: "rbac" }, 403);
        }

        const siteHostname = (body.site_hostname || "").trim();
        const sitePath = (body.site_path || "").trim();
        const basePath = (body.base_path || "").trim();

        if (!siteHostname || !sitePath) {
          return respond({ error: "site_hostname og site_path er påkrevd" }, 400);
        }

        let msToken: string;
        try {
          msToken = await getAppToken();
        } catch (e: any) {
          return respond({ error: "Microsoft-token feilet.", graph_status: 401, step: "token" }, 502);
        }

        const siteUrl = `${GRAPH_BASE}/sites/${siteHostname}:${sitePath}`;
        const siteRes = await graphFetch(msToken, siteUrl);

        if (!siteRes.ok) {
          const status = siteRes.status;
          await siteRes.text();
          return respond({ error: graphErrorMessage(status), graph_status: status, step: "resolve_site" }, 502);
        }

        const siteData = await siteRes.json();
        const resolvedSiteId = siteData.id;

        const drivesUrl = `${GRAPH_BASE}/sites/${resolvedSiteId}/drives`;
        const drivesRes = await graphFetch(msToken, drivesUrl);

        if (!drivesRes.ok) {
          const status = drivesRes.status;
          await drivesRes.text();
          return respond({ error: graphErrorMessage(status), graph_status: status, step: "resolve_drives", site_id: resolvedSiteId }, 502);
        }

        const drivesData = await drivesRes.json();
        const drives = (drivesData.value || []).map((d: any) => ({ id: d.id, name: d.name, webUrl: d.webUrl, driveType: d.driveType }));
        const defaultDrive = pickBestDrive(drivesData.value || []);

        if (!defaultDrive) {
          return respond({ error: "Fant ingen dokumentbibliotek.", step: "resolve_drives", site_id: resolvedSiteId }, 404);
        }

        const spConfig = await loadSpConfig();
        if (!spConfig) {
          return respond({ error: "Ingen firmainnstillinger funnet.", step: "save" }, 400);
        }

        const { error: saveErr } = await supabaseAdmin
          .from("company_settings")
          .update({
            sharepoint_site_id: resolvedSiteId,
            sharepoint_drive_id: defaultDrive.id,
            sharepoint_base_path: basePath || null,
          })
          .eq("id", spConfig.id);

        if (saveErr) {
          return respond({ error: "Kunne ikke lagre konfigurasjon", detail: saveErr.message, step: "save" }, 500);
        }

        await auditLog(supabaseAdmin, authUserId, "sharepoint_config_resolved", spConfig.id, "company_settings", {
          site_id: resolvedSiteId,
          drive_id: defaultDrive.id,
          drive_name: defaultDrive.name,
          base_path: basePath,
        });

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
