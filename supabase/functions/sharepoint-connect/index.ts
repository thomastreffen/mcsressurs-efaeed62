import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

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

  const respond = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
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
    const { data: claimsData, error: claimsErr } = await supabaseAnon.auth.getClaims(jwt);
    if (claimsErr || !claimsData?.claims) return respond({ error: "Invalid session" }, 401);
    const userId = claimsData.claims.sub as string;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json().catch(() => ({}));
    const { action, job_id, project_code, folder_id, site_id, drive_id } = body;

    const msToken = await getAppToken();

    // ── SEARCH: Find folders matching project_code ──
    if (action === "search") {
      if (!project_code) return respond({ error: "project_code required" }, 400);

      console.log(`[sharepoint-connect] Searching for: ${project_code}`);

      // Try searching in the default site's drive
      // First get the root site
      const siteRes = await fetch(`${GRAPH_BASE}/sites/root`, {
        headers: { Authorization: `Bearer ${msToken}` },
      });

      if (!siteRes.ok) {
        const errText = await siteRes.text();
        console.error(`[sharepoint-connect] Site fetch failed: ${siteRes.status} ${errText.substring(0, 200)}`);
        return respond({ error: "Kunne ikke koble til SharePoint", detail: `HTTP ${siteRes.status}` }, 502);
      }

      const siteData = await siteRes.json();
      const rootSiteId = siteData.id;

      // Search for folders matching the project code
      const searchRes = await fetch(
        `${GRAPH_BASE}/sites/${rootSiteId}/drive/root/search(q='${encodeURIComponent(project_code)}')`,
        { headers: { Authorization: `Bearer ${msToken}` } }
      );

      if (!searchRes.ok) {
        const errText = await searchRes.text();
        console.error(`[sharepoint-connect] Search failed: ${searchRes.status}`);
        // Try alternative: search across all sites
        const altSearchRes = await fetch(
          `${GRAPH_BASE}/search/query`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${msToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requests: [{
                entityTypes: ["driveItem"],
                query: { queryString: `${project_code} AND isDocument:false` },
                from: 0,
                size: 10,
              }],
            }),
          }
        );

        if (!altSearchRes.ok) {
          const altErr = await altSearchRes.text();
          return respond({ error: "Søk feilet", detail: altErr.substring(0, 200) }, 502);
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

        return respond({ folders, source: "search_api" });
      }

      const searchData = await searchRes.json();
      const items = searchData.value || [];
      const folders = items
        .filter((item: any) => item.folder)
        .map((item: any) => ({
          id: item.id,
          name: item.name,
          webUrl: item.webUrl,
          siteId: rootSiteId,
          driveId: item.parentReference?.driveId,
          lastModified: item.lastModifiedDateTime,
        }));

      return respond({ folders, source: "drive_search" });
    }

    // ── CONNECT: Save selected folder to job ──
    if (action === "connect") {
      if (!job_id || !folder_id) return respond({ error: "job_id and folder_id required" }, 400);

      const webUrl = body.web_url || null;
      const { error: updateErr } = await supabaseAdmin
        .from("events")
        .update({
          sharepoint_project_code: project_code || null,
          sharepoint_site_id: site_id || null,
          sharepoint_drive_id: drive_id || null,
          sharepoint_folder_id: folder_id,
          sharepoint_folder_web_url: webUrl,
          sharepoint_connected_at: new Date().toISOString(),
        })
        .eq("id", job_id);

      if (updateErr) {
        console.error(`[sharepoint-connect] Update failed:`, updateErr.message);
        return respond({ error: "Kunne ikke lagre kobling", detail: updateErr.message }, 500);
      }

      // Log activity
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
    console.error("[sharepoint-connect] Error:", err.message);
    return respond({ error: err.message || "Internal error" }, 500);
  }
});
