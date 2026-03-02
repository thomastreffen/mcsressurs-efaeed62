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
    const userId = claimsData.claims.sub as string;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const driveId = formData.get("drive_id") as string | null;
    const folderId = formData.get("folder_id") as string | null;
    const jobId = formData.get("job_id") as string | null;
    const companyId = formData.get("company_id") as string | null;

    if (!file || !driveId || !folderId) {
      return respond({ error: "file, drive_id, and folder_id required" }, 400);
    }

    if (file.size > 50 * 1024 * 1024) {
      return respond({ error: "Filen er for stor (maks 50 MB)" }, 413);
    }

    const msToken = await getAppToken();

    // Sanitize filename
    const fileName = file.name.replace(/[^\w.\-() ]/g, "_");

    console.log(`[sharepoint-upload] Uploading ${fileName} (${(file.size / 1024).toFixed(0)} KB) to folder ${folderId}`);

    // Upload to SharePoint via Graph API (simple upload for files < 4MB, use upload session for larger)
    const fileBuffer = await file.arrayBuffer();

    let uploadedItem: any;

    if (file.size < 4 * 1024 * 1024) {
      // Simple upload
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
        const errText = await uploadRes.text();
        console.error(`[sharepoint-upload] Upload failed: ${uploadRes.status} ${errText.substring(0, 300)}`);
        return respond({ error: "Opplasting til SharePoint feilet", detail: `HTTP ${uploadRes.status}` }, 502);
      }

      uploadedItem = await uploadRes.json();
    } else {
      // Create upload session for large files
      const sessionRes = await fetch(
        `${GRAPH_BASE}/drives/${driveId}/items/${folderId}:/${encodeURIComponent(fileName)}:/createUploadSession`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${msToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            item: { "@microsoft.graph.conflictBehavior": "rename" },
          }),
        }
      );

      if (!sessionRes.ok) {
        const errText = await sessionRes.text();
        return respond({ error: "Kunne ikke starte opplasting", detail: errText.substring(0, 200) }, 502);
      }

      const session = await sessionRes.json();
      const uploadUrl = session.uploadUrl;

      // Upload in single chunk (for simplicity up to 50MB)
      const chunkRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(file.size),
          "Content-Range": `bytes 0-${file.size - 1}/${file.size}`,
        },
        body: fileBuffer,
      });

      if (!chunkRes.ok) {
        const errText = await chunkRes.text();
        return respond({ error: "Opplasting feilet", detail: errText.substring(0, 200) }, 502);
      }

      uploadedItem = await chunkRes.json();
    }

    console.log(`[sharepoint-upload] Uploaded: ${uploadedItem.id} ${uploadedItem.name}`);

    // Log in job_document_links
    if (jobId && companyId) {
      await supabaseAdmin.from("job_document_links").insert({
        job_id: jobId,
        company_id: companyId,
        source: "sharepoint",
        item_id: uploadedItem.id,
        name: uploadedItem.name,
        web_url: uploadedItem.webUrl,
        mime_type: uploadedItem.file?.mimeType || file.type,
        file_size: uploadedItem.size,
        uploaded_by: userId,
      });

      await supabaseAdmin.from("event_logs").insert({
        event_id: jobId,
        action_type: "sharepoint_upload",
        performed_by: userId,
        change_summary: `Fil lastet opp til SharePoint: ${uploadedItem.name}`,
      });
    }

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
    console.error("[sharepoint-upload] Error:", err.message);
    return respond({ error: err.message || "Internal error" }, 500);
  }
});
