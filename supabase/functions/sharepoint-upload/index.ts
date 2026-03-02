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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const jobId = formData.get("job_id") as string | null;
    const subFolderId = formData.get("folder_id") as string | null;

    if (!file || !jobId) return respond({ error: "file and job_id required" }, 400);

    if (file.size > 50 * 1024 * 1024) {
      return respond({ error: "Filen er for stor (maks 50 MB)" }, 413);
    }

    // Job lookup — server-side
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("events")
      .select("id, company_id, department_id, created_by, sharepoint_drive_id, sharepoint_folder_id")
      .eq("id", jobId)
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

    // RBAC: upload permission
    const { data: canUpload } = await supabaseAdmin.rpc("check_permission_v2", {
      _auth_user_id: authUserId,
      _perm: "sharepoint.upload",
    });
    if (!canUpload) return respond({ error: "Du mangler rettighet til å laste opp filer til SharePoint.", step: "rbac" }, 403);

    if (!job.sharepoint_drive_id || !job.sharepoint_folder_id) {
      return respond({
        error: "Jobben er ikke koblet til SharePoint. Koble først via Dokumenter-fanen.",
        step: "not_linked",
      }, 409);
    }

    const driveId = job.sharepoint_drive_id;
    const folderId = subFolderId || job.sharepoint_folder_id;

    let msToken: string;
    try {
      msToken = await getAppToken();
    } catch (e: any) {
      return respond({ error: "Microsoft-token feilet.", graph_status: 401, step: "token" }, 502);
    }

    const fileName = file.name.replace(/[^\w.\-() ]/g, "_");
    console.log(`[sharepoint-upload] request_id=${requestId} job_id=${jobId} file=${fileName} size=${(file.size / 1024).toFixed(0)}KB`);

    const fileBuffer = await file.arrayBuffer();
    let uploadedItem: any;

    if (file.size < 4 * 1024 * 1024) {
      const uploadRes = await fetch(
        `${GRAPH_BASE}/drives/${driveId}/items/${folderId}:/${encodeURIComponent(fileName)}:/content`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${msToken}`,
            "Content-Type": file.type || "application/octet-stream",
          },
          body: fileBuffer,
        }
      );

      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({}));
        const errCode = errBody?.error?.code || "";
        return respond({
          error: graphErrorMessage(uploadRes.status, errCode),
          graph_status: uploadRes.status,
          graph_error_code: errCode,
          step: "upload",
        }, 502);
      }

      uploadedItem = await uploadRes.json();
    } else {
      const sessionRes = await fetch(
        `${GRAPH_BASE}/drives/${driveId}/items/${folderId}:/${encodeURIComponent(fileName)}:/createUploadSession`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${msToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
        }
      );

      if (!sessionRes.ok) {
        const errBody = await sessionRes.json().catch(() => ({}));
        const errCode = errBody?.error?.code || "";
        return respond({
          error: graphErrorMessage(sessionRes.status, errCode),
          graph_status: sessionRes.status,
          graph_error_code: errCode,
          step: "upload_session",
        }, 502);
      }

      const session = await sessionRes.json();
      const chunkRes = await fetch(session.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(file.size),
          "Content-Range": `bytes 0-${file.size - 1}/${file.size}`,
        },
        body: fileBuffer,
      });

      if (!chunkRes.ok) {
        return respond({ error: "Opplasting feilet. Prøv igjen.", graph_status: chunkRes.status, step: "upload_chunk" }, 502);
      }

      uploadedItem = await chunkRes.json();
    }

    console.log(`[sharepoint-upload] request_id=${requestId} uploaded: ${uploadedItem.id} ${uploadedItem.name}`);

    // Log in job_document_links
    if (job.company_id) {
      try {
        await supabaseAdmin.from("job_document_links").insert({
          job_id: jobId,
          company_id: job.company_id,
          source: "sharepoint",
          item_id: uploadedItem.id,
          name: uploadedItem.name,
          web_url: uploadedItem.webUrl,
          mime_type: uploadedItem.file?.mimeType || file.type,
          file_size: uploadedItem.size,
          uploaded_by: authUserId,
        });
      } catch (_) { /* non-critical */ }
    }

    try {
      await supabaseAdmin.from("event_logs").insert({
        event_id: jobId,
        action_type: "sharepoint_upload",
        performed_by: authUserId,
        change_summary: `Fil lastet opp til SharePoint: ${uploadedItem.name}`,
      });
    } catch (_) { /* non-critical */ }

    return respond({
      success: true,
      item: {
        id: uploadedItem.id,
        name: uploadedItem.name,
        webUrl: uploadedItem.webUrl,
        size: uploadedItem.size,
        mimeType: uploadedItem.file?.mimeType,
      },
    });
  } catch (err: any) {
    console.error(`[sharepoint-upload] request_id=${requestId} unhandled error:`, err.message);
    return respond({ error: err.message || "Internal error", step: "unknown" }, 500);
  }
});
