import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function graphErrorMessage(status: number, _code?: string): string {
  if (status === 401) return "Microsoft-token feilet. Sjekk client secret og tenant.";
  if (status === 403) return "Appen mangler rettigheter til SharePoint-området.";
  if (status === 404) return "Filen ble ikke funnet i SharePoint.";
  if (status === 429) return "For mange forespørsler. Prøv igjen om litt.";
  if (status >= 500) return "Microsoft/Graph midlertidig feil.";
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
  if (!res.ok) throw new Error(`Token failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
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
    const authUserId = userData.user.id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json().catch(() => ({}));
    const { job_id, item_id } = body;

    if (!item_id) return respond({ error: "item_id required" }, 400);
    if (!job_id) return respond({ error: "job_id required" }, 400);

    // Job lookup — server-side
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("events")
      .select("id, company_id, department_id, created_by, sharepoint_drive_id")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) return respond({ error: "Jobb ikke funnet", step: "lookup" }, 404);

    // RBAC: scope access
    const { data: hasAccess } = await supabaseAdmin.rpc("can_access_record_v2", {
      _auth_user_id: authUserId,
      _record_company_id: job.company_id,
      _record_department_id: job.department_id || null,
      _record_created_by: job.created_by || null,
      _record_id: job.id,
    });
    if (!hasAccess) return respond({ error: "Du mangler tilgang til SharePoint for dette selskapet.", step: "rbac" }, 403);

    // RBAC: permission
    const { data: canView } = await supabaseAdmin.rpc("check_permission_v2", {
      _auth_user_id: authUserId,
      _perm: "sharepoint.view",
    });
    if (!canView) return respond({ error: "Du mangler SharePoint-leserettigheter.", step: "rbac" }, 403);

    if (!job.sharepoint_drive_id) {
      return respond({ error: "Jobben er ikke koblet til SharePoint.", step: "not_linked" }, 409);
    }

    const driveId = job.sharepoint_drive_id;

    console.log(`[sharepoint-preview-url] request_id=${requestId} job_id=${job_id} item_id=${item_id}`);

    let msToken: string;
    try {
      msToken = await getAppToken();
    } catch (e: any) {
      return respond({ error: "Microsoft-token feilet.", graph_status: 401, step: "token" }, 502);
    }

    // Try preview API
    const previewRes = await fetch(
      `${GRAPH_BASE}/drives/${driveId}/items/${item_id}/preview`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${msToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );

    if (previewRes.ok) {
      const previewData = await previewRes.json();
      return respond({ previewUrl: previewData.getUrl, type: "embed" });
    } else {
      await previewRes.text(); // consume
    }

    // Fallback: get webUrl
    const itemRes = await fetch(
      `${GRAPH_BASE}/drives/${driveId}/items/${item_id}?$select=webUrl,file,name`,
      { headers: { Authorization: `Bearer ${msToken}` } }
    );

    if (!itemRes.ok) {
      const errBody = await itemRes.json().catch(() => ({}));
      const errCode = errBody?.error?.code || "";
      return respond({
        error: graphErrorMessage(itemRes.status, errCode),
        graph_status: itemRes.status,
        graph_error_code: errCode,
        step: "preview",
      }, 502);
    }

    const itemData = await itemRes.json();
    const mimeType = itemData.file?.mimeType || "";

    if (mimeType.startsWith("image/")) {
      const shareRes = await fetch(
        `${GRAPH_BASE}/drives/${driveId}/items/${item_id}/createLink`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${msToken}`, "Content-Type": "application/json" },
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
      } else {
        await shareRes.text(); // consume
      }
    }

    return respond({ previewUrl: itemData.webUrl, type: "web", webUrl: itemData.webUrl });
  } catch (err: any) {
    console.error(`[sharepoint-preview-url] request_id=${requestId} unhandled error:`, err.message);
    return respond({ error: err.message || "Internal error", step: "unknown" }, 500);
  }
});
