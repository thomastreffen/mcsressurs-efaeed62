import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function graphErrorMessage(status: number, code?: string): string {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  const respond = (data: any, status = 200) =>
    new Response(JSON.stringify({ ...data, request_id: requestId }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

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
    const { action, job_id, project_code, folder_id, site_id, drive_id } = body;

    console.log(`[sharepoint-connect] request_id=${requestId} action=${action} job_id=${job_id} project_code=${project_code}`);

    // ── SEARCH: Find folders matching project_code ──
    if (action === "search") {
      const code = (project_code || "").trim().toUpperCase().replace(/\s+/g, "");
      if (!code) return respond({ error: "project_code required" }, 400);

      let msToken: string;
      try {
        msToken = await getAppToken();
      } catch (e: any) {
        console.error(`[sharepoint-connect] request_id=${requestId} step=token error=${e.message}`);
        return respond({
          error: "Microsoft-token feilet. Sjekk client secret og tenant.",
          graph_status: 401,
          graph_error_code: "invalid_token",
          step: "token",
        }, 502);
      }

      // Get root site
      const siteRes = await fetch(`${GRAPH_BASE}/sites/root`, {
        headers: { Authorization: `Bearer ${msToken}` },
      });

      if (!siteRes.ok) {
        const errBody = await siteRes.json().catch(() => ({}));
        const errCode = errBody?.error?.code || "";
        console.error(`[sharepoint-connect] request_id=${requestId} step=resolve graph_status=${siteRes.status} graph_error_code=${errCode}`);
        return respond({
          error: graphErrorMessage(siteRes.status, errCode),
          graph_status: siteRes.status,
          graph_error_code: errCode,
          step: "resolve",
        }, 502);
      }

      const siteData = await siteRes.json();
      const rootSiteId = siteData.id;

      // Search for folders matching the project code
      const searchRes = await fetch(
        `${GRAPH_BASE}/sites/${rootSiteId}/drive/root/search(q='${encodeURIComponent(code)}')`,
        { headers: { Authorization: `Bearer ${msToken}` } }
      );

      if (!searchRes.ok) {
        // Fallback: search API across all sites
        const altSearchRes = await fetch(`${GRAPH_BASE}/search/query`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${msToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: [{
              entityTypes: ["driveItem"],
              query: { queryString: `${code} AND isDocument:false` },
              from: 0,
              size: 10,
            }],
          }),
        });

        if (!altSearchRes.ok) {
          const errBody = await altSearchRes.json().catch(() => ({}));
          const errCode = errBody?.error?.code || "";
          console.error(`[sharepoint-connect] request_id=${requestId} step=search graph_status=${altSearchRes.status} graph_error_code=${errCode}`);
          return respond({
            error: graphErrorMessage(altSearchRes.status, errCode),
            graph_status: altSearchRes.status,
            graph_error_code: errCode,
            step: "search",
          }, 502);
        }

        const altData = await altSearchRes.json();
        const hits = altData.value?.[0]?.hitsContainers?.[0]?.hits || [];
        const folders = hits
          .filter((h: any) => h.resource?.folder)
          .map((h: any) => ({
            id: h.resource.id,
            name: h.resource.name,
            webUrl: h.resource.webUrl,
            siteId: h.resource.parentReference?.siteId || rootSiteId,
            driveId: h.resource.parentReference?.driveId,
            lastModified: h.resource.lastModifiedDateTime,
          }));

        if (folders.length === 0) {
          return respond({
            error: `Fant ikke "${code}" under valgt base path. Sjekk at mappen finnes i riktig dokumentbibliotek.`,
            graph_status: 404,
            graph_error_code: "itemNotFound",
            step: "search",
            folders: [],
          }, 200);
        }

        return respond({ folders, source: "search_api" });
      }

      const searchData = await searchRes.json();
      const items = searchData.value || [];
      // Prioritize exact match, then prefix match
      const folders = items
        .filter((item: any) => item.folder)
        .map((item: any) => ({
          id: item.id,
          name: item.name,
          webUrl: item.webUrl,
          siteId: rootSiteId,
          driveId: item.parentReference?.driveId,
          lastModified: item.lastModifiedDateTime,
        }))
        .sort((a: any, b: any) => {
          const aExact = a.name.toUpperCase() === code ? 0 : 1;
          const bExact = b.name.toUpperCase() === code ? 0 : 1;
          if (aExact !== bExact) return aExact - bExact;
          const aPrefix = a.name.toUpperCase().startsWith(code) ? 0 : 1;
          const bPrefix = b.name.toUpperCase().startsWith(code) ? 0 : 1;
          return aPrefix - bPrefix;
        });

      if (folders.length === 0) {
        return respond({
          error: `Fant ikke "${code}" under valgt base path. Sjekk at mappen finnes i riktig dokumentbibliotek.`,
          graph_status: 404,
          graph_error_code: "itemNotFound",
          step: "search",
          folders: [],
        }, 200);
      }

      return respond({ folders, source: "drive_search" });
    }

    // ── CONNECT: Save selected folder to job ──
    if (action === "connect") {
      if (!job_id || !folder_id) return respond({ error: "job_id and folder_id required" }, 400);

      const webUrl = body.web_url || null;
      const { error: updateErr } = await supabaseAdmin
        .from("events")
        .update({
          sharepoint_project_code: (project_code || "").trim().toUpperCase().replace(/\s+/g, "") || null,
          sharepoint_site_id: site_id || null,
          sharepoint_drive_id: drive_id || null,
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
      });

      return respond({ success: true });
    }

    // ── DISCONNECT ──
    if (action === "disconnect") {
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
      });

      return respond({ success: true });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error(`[sharepoint-connect] request_id=${requestId} unhandled error:`, err.message);
    return respond({ error: err.message || "Internal error", step: "unknown" }, 500);
  }
});
