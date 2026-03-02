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
  if (!res.ok) throw new Error(`Token failed: ${res.status}`);
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

    const body = await req.json().catch(() => ({}));
    const { drive_id, item_id } = body;

    if (!drive_id || !item_id) {
      return respond({ error: "drive_id and item_id required" }, 400);
    }

    const msToken = await getAppToken();

    // Get preview URL using the preview API
    const previewRes = await fetch(
      `${GRAPH_BASE}/drives/${drive_id}/items/${item_id}/preview`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${msToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );

    if (previewRes.ok) {
      const previewData = await previewRes.json();
      return respond({
        previewUrl: previewData.getUrl,
        type: "embed",
      });
    }

    // Fallback: get the webUrl for Office Online viewing
    const itemRes = await fetch(
      `${GRAPH_BASE}/drives/${drive_id}/items/${item_id}?$select=webUrl,file,name`,
      { headers: { Authorization: `Bearer ${msToken}` } }
    );

    if (!itemRes.ok) {
      const errText = await itemRes.text();
      return respond({ error: "Kunne ikke hente forhåndsvisning", detail: `HTTP ${itemRes.status}` }, 502);
    }

    const itemData = await itemRes.json();
    const mimeType = itemData.file?.mimeType || "";

    // For images, create a sharing link for direct access
    if (mimeType.startsWith("image/")) {
      const shareRes = await fetch(
        `${GRAPH_BASE}/drives/${drive_id}/items/${item_id}/createLink`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${msToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ type: "view", scope: "organization" }),
        }
      );
      if (shareRes.ok) {
        const shareData = await shareRes.json();
        return respond({
          previewUrl: shareData.link?.webUrl || itemData.webUrl,
          type: "image",
          webUrl: itemData.webUrl,
        });
      }
    }

    // Fallback to webUrl (opens in Office Online or browser)
    return respond({
      previewUrl: itemData.webUrl,
      type: "web",
      webUrl: itemData.webUrl,
    });
  } catch (err: any) {
    console.error("[sharepoint-preview-url] Error:", err.message);
    return respond({ error: err.message || "Internal error" }, 500);
  }
});
