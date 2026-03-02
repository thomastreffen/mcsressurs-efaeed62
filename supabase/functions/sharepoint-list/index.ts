import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL_MS = 120_000;

function graphErrorMessage(status: number, code?: string): string {
  if (status === 401) return "Microsoft-token feilet. Sjekk client secret og tenant.";
  if (status === 403) return "Appen mangler rettigheter til SharePoint-området eller drive. Sjekk Graph permissions og site-tilgang.";
  if (status === 404) return "Fant ikke mappen i SharePoint. Sjekk at koblingen er riktig.";
  if (status === 429) return "For mange forespørsler mot Microsoft. Prøv igjen om litt.";
  if (status >= 500) return "Microsoft/Graph midlertidig feil. Prøv igjen.";
  return `SharePoint-feil (HTTP ${status})`;
}

async function getAppToken(): Promise<string> {
  const cached = cache.get("app_token");
  if (cached && cached.expires > Date.now()) return cached.data;

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
  if (!res.ok) throw new Error(`Token failed: ${res.status}`);
  const data = await res.json();
  cache.set("app_token", { data: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 });
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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json().catch(() => ({}));
    const { job_id, folder_id: subfolderId, query, sort } = body;

    // Support legacy direct calls and new job-centric calls
    let driveId: string;
    let folderId: string;

    if (job_id) {
      // Job-centric: lookup from DB
      const { data: job, error: jobErr } = await supabaseAdmin
        .from("events")
        .select("sharepoint_drive_id, sharepoint_folder_id, company_id")
        .eq("id", job_id)
        .single();

      if (jobErr || !job) {
        return respond({ error: "Jobb ikke funnet" }, 404);
      }

      if (!job.sharepoint_drive_id || !job.sharepoint_folder_id) {
        return respond({
          error: "Jobben er ikke koblet til SharePoint. Koble først via Dokumenter-fanen.",
          step: "lookup",
        }, 409);
      }

      driveId = job.sharepoint_drive_id;
      folderId = subfolderId || job.sharepoint_folder_id;
    } else if (body.drive_id && body.folder_id) {
      // Legacy fallback
      driveId = body.drive_id;
      folderId = body.folder_id;
    } else {
      return respond({ error: "job_id required" }, 400);
    }

    console.log(`[sharepoint-list] request_id=${requestId} job_id=${job_id} folder=${folderId} query=${query || ""}`);

    // Check cache
    const cacheKey = `list:${driveId}:${folderId}:${query || ""}:${sort || ""}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return respond({ items: cached.data, cached: true });
    }

    let msToken: string;
    try {
      msToken = await getAppToken();
    } catch (e: any) {
      console.error(`[sharepoint-list] request_id=${requestId} step=token error=${e.message}`);
      return respond({
        error: "Microsoft-token feilet. Sjekk client secret og tenant.",
        graph_status: 401,
        graph_error_code: "invalid_token",
        step: "token",
      }, 502);
    }

    let url: string;
    if (query) {
      url = `${GRAPH_BASE}/drives/${driveId}/items/${folderId}/search(q='${encodeURIComponent(query)}')`;
    } else {
      url = `${GRAPH_BASE}/drives/${driveId}/items/${folderId}/children?$top=200&$orderby=lastModifiedDateTime desc`;
    }

    const graphRes = await fetch(url, {
      headers: { Authorization: `Bearer ${msToken}` },
    });

    if (!graphRes.ok) {
      const errBody = await graphRes.json().catch(() => ({}));
      const errCode = errBody?.error?.code || "";
      console.error(`[sharepoint-list] request_id=${requestId} step=list graph_status=${graphRes.status} graph_error_code=${errCode}`);
      return respond({
        error: graphErrorMessage(graphRes.status, errCode),
        graph_status: graphRes.status,
        graph_error_code: errCode,
        step: "list",
      }, 502);
    }

    const graphData = await graphRes.json();
    const rawItems = graphData.value || [];

    const items = rawItems.map((item: any) => ({
      id: item.id,
      name: item.name,
      isFolder: !!item.folder,
      size: item.size || 0,
      mimeType: item.file?.mimeType || null,
      webUrl: item.webUrl,
      lastModified: item.lastModifiedDateTime,
      lastModifiedBy: item.lastModifiedBy?.user?.displayName || null,
      childCount: item.folder?.childCount || 0,
    }));

    if (sort === "name") {
      items.sort((a: any, b: any) => a.name.localeCompare(b.name, "nb"));
    } else if (sort === "size") {
      items.sort((a: any, b: any) => b.size - a.size);
    }

    cache.set(cacheKey, { data: items, expires: Date.now() + CACHE_TTL_MS });

    return respond({ items });
  } catch (err: any) {
    console.error(`[sharepoint-list] request_id=${requestId} unhandled error:`, err.message);
    return respond({ error: err.message || "Internal error", step: "unknown" }, 500);
  }
});
