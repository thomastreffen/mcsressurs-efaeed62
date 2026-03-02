import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// Simple in-memory cache (per cold start)
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL_MS = 120_000; // 2 minutes

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

  const respond = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // Validate JWT
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

    const body = await req.json().catch(() => ({}));
    const { drive_id, folder_id, query, sort } = body;

    if (!drive_id || !folder_id) {
      return respond({ error: "drive_id and folder_id required" }, 400);
    }

    // Check cache
    const cacheKey = `list:${drive_id}:${folder_id}:${query || ""}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return respond({ items: cached.data, cached: true });
    }

    const msToken = await getAppToken();

    // Build URL
    let url: string;
    if (query) {
      // Search within the folder
      url = `${GRAPH_BASE}/drives/${drive_id}/items/${folder_id}/search(q='${encodeURIComponent(query)}')`;
    } else {
      url = `${GRAPH_BASE}/drives/${drive_id}/items/${folder_id}/children?$top=200&$orderby=lastModifiedDateTime desc`;
    }

    const graphRes = await fetch(url, {
      headers: { Authorization: `Bearer ${msToken}` },
    });

    if (!graphRes.ok) {
      const errText = await graphRes.text();
      console.error(`[sharepoint-list] Graph error: ${graphRes.status} ${errText.substring(0, 300)}`);
      return respond({ error: "Kunne ikke hente filer", detail: `HTTP ${graphRes.status}` }, 502);
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
      thumbnailUrl: null, // Could fetch thumbnails separately if needed
    }));

    // Sort
    if (sort === "name") {
      items.sort((a: any, b: any) => a.name.localeCompare(b.name, "nb"));
    } else if (sort === "size") {
      items.sort((a: any, b: any) => b.size - a.size);
    }
    // Default is already lastModified desc from Graph

    // Cache result
    cache.set(cacheKey, { data: items, expires: Date.now() + CACHE_TTL_MS });

    return respond({ items });
  } catch (err: any) {
    console.error("[sharepoint-list] Error:", err.message);
    return respond({ error: err.message || "Internal error" }, 500);
  }
});
