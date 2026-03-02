import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ── Azure App Token ──
async function getAppToken(): Promise<string | null> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) {
    console.error("[inbox-sync] Missing Azure env vars");
    return null;
  }
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  );
  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error(`[inbox-sync] Token error: ${tokenRes.status} ${errText.substring(0, 300)}`);
    return null;
  }
  const tokenData = await tokenRes.json();
  console.log("[inbox-sync] Acquired APPLICATION token");
  return tokenData.access_token;
}

// ── Fetch Mailbox Messages ──
async function fetchMailboxMessages(
  msToken: string,
  mailboxAddress: string,
  sinceDate: string,
  isShared: boolean,
  deltaLink: string | null
): Promise<{ messages: any[]; newDeltaLink: string | null }> {
  // Include internetMessageHeaders to get In-Reply-To and References
  const selectFields = "id,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,hasAttachments,isDraft,conversationId,internetMessageId,internetMessageHeaders";
  let url: string;
  if (deltaLink) {
    url = deltaLink;
  } else if (isShared) {
    const inboxPath = `${GRAPH_BASE}/users/${encodeURIComponent(mailboxAddress)}/mailFolders/Inbox/messages/delta`;
    url = `${inboxPath}?$top=50&$select=${selectFields}`;
  } else {
    const inboxPath = `${GRAPH_BASE}/users/${encodeURIComponent(mailboxAddress)}/mailFolders/Inbox/messages`;
    const filter = `receivedDateTime ge ${sinceDate}`;
    url = `${inboxPath}?$filter=${encodeURIComponent(filter)}&$top=50&$orderby=receivedDateTime desc&$select=${selectFields}`;
  }

  const allMessages: any[] = [];
  let newDeltaLink: string | null = null;
  let nextLink: string | null = url;

  while (nextLink) {
    const graphRes = await fetch(nextLink, {
      headers: { Authorization: `Bearer ${msToken}` },
    });
    if (!graphRes.ok) {
      const errText = await graphRes.text();
      console.error(`[inbox-sync] Graph error for ${mailboxAddress}: ${graphRes.status} ${errText.substring(0, 200)}`);
      return { messages: [], newDeltaLink: null };
    }
    const graphData = await graphRes.json();
    const msgs = (graphData.value || []).filter((m: any) => !m.isDraft);
    if (msgs.length > 0) {
      console.log(`[inbox-sync][DEBUG] Page: ${msgs.length} msgs, first: "${msgs[0].subject}"`);
    }
    allMessages.push(...msgs);
    nextLink = graphData["@odata.nextLink"] || null;
    if (graphData["@odata.deltaLink"]) newDeltaLink = graphData["@odata.deltaLink"];
  }

  return { messages: allMessages, newDeltaLink };
}

// ── Classification Heuristics ──
function classifyMessage(subject: string, bodyPreview: string) {
  const text = `${subject} ${bodyPreview}`.toLowerCase();
  if (text.match(/feil|haste|kritisk|akutt|stopp|nedetid/))
    return { category: "urgent_support", urgency: "critical", recommended_next_action: "call" };
  if (text.match(/bestilling|ordre|po\b|vi aksepterer|vi bestiller|bekreft/))
    return { category: "order", urgency: "high", recommended_next_action: "schedule" };
  if (text.match(/tilbud|pris|kostnadsestimat|gi pris|prisforespørsel|forespørsel/))
    return { category: "quote_request", urgency: "normal", recommended_next_action: "quote" };
  if (text.match(/tavle|samleskinne|busbar|strømskinne|skinne|bryter|ampere|enlinje/))
    return { category: "technical", urgency: "normal", recommended_next_action: "clarify" };
  if (text.match(/schneider|eaton|siemens|3va|pxr|ups|generator|aggregat|datasenter|abb|rittal/))
    return { category: "technical", urgency: "normal", recommended_next_action: "clarify" };
  if (text.match(/125a|160a|250a|400a|630a|800a|1000a|1250a|1600a/))
    return { category: "technical", urgency: "normal", recommended_next_action: "clarify" };
  if (text.match(/faktura|betaling|kreditnota/))
    return { category: "invoice", urgency: "normal", recommended_next_action: "document" };
  if (text.match(/befaring|prosjekt|anlegg|installasjon/))
    return { category: "site_visit", urgency: "normal", recommended_next_action: "schedule" };
  return { category: "general", urgency: "normal", recommended_next_action: "none" };
}

// ── Routing Rules ──
function applyRoutingRules(
  rules: any[], subject: string, bodyPreview: string, fromEmail: string, mailboxAddress: string
): Record<string, any> {
  const result: any = {};
  for (const rule of rules) {
    if (!rule.is_enabled) continue;
    if (rule.mailbox_address && rule.mailbox_address !== mailboxAddress) continue;
    let matched = false;
    if (rule.subject_contains) {
      const keywords = rule.subject_contains.split(",").map((k: string) => k.trim().toLowerCase());
      if (keywords.some((kw: string) => subject.toLowerCase().includes(kw))) matched = true;
    }
    if (rule.body_contains) {
      const keywords = rule.body_contains.split(",").map((k: string) => k.trim().toLowerCase());
      if (keywords.some((kw: string) => bodyPreview.toLowerCase().includes(kw) || subject.toLowerCase().includes(kw))) matched = true;
    }
    if (rule.from_contains && fromEmail.toLowerCase().includes(rule.from_contains.toLowerCase())) matched = true;
    if (matched) {
      if (rule.priority_set) result.priority = rule.priority_set;
      if (rule.status_set) result.status = rule.status_set;
      if (rule.next_action_set) result.next_action = rule.next_action_set;
      if (rule.owner_user_id_set) result.owner_user_id = rule.owner_user_id_set;
      if (rule.scope_set) result.scope = rule.scope_set;
    }
  }
  return result;
}

// ── Subject Normalization ──
function normalizeSubject(raw: string): string {
  let s = raw.trim();
  while (/^(re|sv|vs|fw|fwd)\s*:\s*/i.test(s)) {
    s = s.replace(/^(re|sv|vs|fw|fwd)\s*:\s*/i, "").trim();
  }
  return s;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// ═══════════════════════════════════════════════════════════════
// ID EXTRACTION ENGINE (v2)
// ═══════════════════════════════════════════════════════════════

type IdType = "case" | "job" | "offer" | "lead" | "project";

interface IdMatch {
  type: IdType;
  pattern: string;
  rawMatch: string;
  lookupValue: string;
  source: "subject" | "body";
}

interface ExtractedIds {
  caseIds: IdMatch[];
  jobIds: IdMatch[];
  offerIds: IdMatch[];
  leadIds: IdMatch[];
  projectIds: IdMatch[];
  standaloneNumbers: IdMatch[];
}

function extractIdsFromText(text: string, source: "subject" | "body"): IdMatch[] {
  const matches: IdMatch[] = [];
  const seen = new Set<string>();

  // CASE-XXXXXX (with optional brackets, case-insensitive)
  for (const m of text.matchAll(/[\[\(]?(CASE-(\d{4,6}))[\]\)]?/gi)) {
    const padded = m[2].padStart(6, "0");
    const key = `case:${padded}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({ type: "case", pattern: "full_case", rawMatch: m[0], lookupValue: `CASE-${padded}`, source });
    }
  }

  // JOB-XXXXXX (flexible digits, case-insensitive)
  for (const m of text.matchAll(/[\[\(]?JOB-(\d{4,6})[\]\)]?/gi)) {
    const padded = m[1].padStart(6, "0");
    const key = `job:${padded}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({ type: "job", pattern: "full_job", rawMatch: m[0], lookupValue: `JOB-${padded}`, source });
    }
  }

  // PROJ-XXXXXX (project number)
  for (const m of text.matchAll(/[\[\(]?PROJ-(\d{4,6})[\]\)]?/gi)) {
    const padded = m[1].padStart(6, "0");
    const key = `project:${padded}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({ type: "project", pattern: "full_project", rawMatch: m[0], lookupValue: `PROJ-${padded}`, source });
    }
  }

  // OFFER-XXXX (generic offer number)
  for (const m of text.matchAll(/[\[\(]?OFFER-(\d{3,6})[\]\)]?/gi)) {
    const key = `offer:OFFER-${m[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({ type: "offer", pattern: "offer_prefix", rawMatch: m[0], lookupValue: `OFFER-${m[1]}`, source });
    }
  }

  // MCS-YYYY-NNNN (offer)
  for (const m of text.matchAll(/\bMCS-(\d{4})-(\d{4,6})\b/gi)) {
    const val = `MCS-${m[1]}-${m[2]}`;
    const key = `offer:${val}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({ type: "offer", pattern: "mcs_offer", rawMatch: m[0], lookupValue: val, source });
    }
  }

  // LEAD-YYYY-NNNNNN or LEAD-NNNN
  for (const m of text.matchAll(/[\[\(]?LEAD-(\d{4})-(\d{4,6})[\]\)]?/gi)) {
    const val = `LEAD-${m[1]}-${m[2]}`;
    const key = `lead:${val}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({ type: "lead", pattern: "full_lead", rawMatch: m[0], lookupValue: val, source });
    }
  }
  for (const m of text.matchAll(/[\[\(]?LEAD-(\d{4,6})[\]\)]?/gi)) {
    // Skip if already matched as LEAD-YYYY-NNNNNN
    if (text.match(new RegExp(`LEAD-\\d{4}-${m[1]}`, "i"))) continue;
    const key = `lead:LEAD-${m[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({ type: "lead", pattern: "short_lead", rawMatch: m[0], lookupValue: `LEAD-${m[1]}`, source });
    }
  }

  return matches;
}

function extractAllIds(normalizedSubject: string, bodyText: string): ExtractedIds {
  const subjectMatches = extractIdsFromText(normalizedSubject, "subject");
  const bodyMatches = extractIdsFromText(bodyText, "body");

  const all: IdMatch[] = [...subjectMatches];
  const seenKeys = new Set(subjectMatches.map(m => `${m.type}:${m.lookupValue}`));
  for (const m of bodyMatches) {
    const key = `${m.type}:${m.lookupValue}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      all.push(m);
    }
  }

  const result: ExtractedIds = { caseIds: [], jobIds: [], offerIds: [], leadIds: [], projectIds: [], standaloneNumbers: [] };
  for (const m of all) {
    switch (m.type) {
      case "case": result.caseIds.push(m); break;
      case "job": result.jobIds.push(m); break;
      case "offer": result.offerIds.push(m); break;
      case "lead": result.leadIds.push(m); break;
      case "project": result.projectIds.push(m); break;
    }
  }

  // Standalone 6-digit numbers only if no other IDs found
  if (all.length === 0) {
    const combined = normalizedSubject + "\n" + bodyText;
    const sixMatch = combined.match(/\b(\d{6})\b/);
    if (sixMatch) {
      result.standaloneNumbers.push({
        type: "job", pattern: "standalone_6digit", rawMatch: sixMatch[0],
        lookupValue: sixMatch[1], source: normalizedSubject.includes(sixMatch[0]) ? "subject" : "body",
      });
    }
  }

  // Short prefix (#1, case 1, sak 1) — only if nothing else matched
  if (all.length === 0 && result.standaloneNumbers.length === 0) {
    const combined = normalizedSubject + "\n" + bodyText;
    const shortMatch = combined.match(/(?:#|(?:case|sak)\s+)(\d{1,5})\b/i);
    if (shortMatch) {
      result.caseIds.push({
        type: "case", pattern: "short_prefix", rawMatch: shortMatch[0],
        lookupValue: `CASE-${shortMatch[1].padStart(6, "0")}`,
        source: normalizedSubject.includes(shortMatch[0]) ? "subject" : "body",
      });
    }
  }

  return result;
}

// ── Resolve ID matches to UUIDs with multi-tenant safety ──
interface ResolvedLink {
  field: string;  // linked_work_order_id etc
  id: string;     // UUID
  displayRef: string; // JOB-000010
  type: IdType;
  matchSource: "subject" | "body";
  matchedText: string;
}

async function resolveJobId(match: IdMatch, companyId: string, admin: any): Promise<ResolvedLink | null> {
  // Search by internal_number (JOB-XXXXXX) or job_number
  const { data } = await admin
    .from("events")
    .select("id, internal_number")
    .eq("company_id", companyId)
    .or(`internal_number.eq.${match.lookupValue},job_number.eq.${match.lookupValue}`)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return {
    field: "linked_work_order_id", id: data.id, displayRef: match.lookupValue,
    type: "job", matchSource: match.source, matchedText: match.rawMatch.substring(0, 80),
  };
}

async function resolveCaseId(match: IdMatch, companyId: string, admin: any): Promise<string | null> {
  const { data } = await admin
    .from("cases")
    .select("id")
    .eq("case_number", match.lookupValue)
    .eq("company_id", companyId)
    .maybeSingle();
  return data?.id || null;
}

async function resolveOfferId(match: IdMatch, companyId: string, admin: any): Promise<ResolvedLink | null> {
  // Try offer_number exact match, then partial
  const { data } = await admin
    .from("offers")
    .select("id, offer_number")
    .eq("company_id", companyId)
    .or(`offer_number.eq.${match.lookupValue}`)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return {
    field: "linked_offer_id", id: data.id, displayRef: match.lookupValue,
    type: "offer", matchSource: match.source, matchedText: match.rawMatch.substring(0, 80),
  };
}

async function resolveLeadId(match: IdMatch, companyId: string, admin: any): Promise<ResolvedLink | null> {
  const { data } = await admin
    .from("leads")
    .select("id")
    .eq("company_id", companyId)
    .or(`lead_ref_code.eq.${match.lookupValue}`)
    .maybeSingle();
  if (!data) return null;
  return {
    field: "linked_lead_id", id: data.id, displayRef: match.lookupValue,
    type: "lead", matchSource: match.source, matchedText: match.rawMatch.substring(0, 80),
  };
}

async function resolveProjectId(match: IdMatch, companyId: string, admin: any): Promise<ResolvedLink | null> {
  const { data } = await admin
    .from("events")
    .select("id, project_number")
    .eq("company_id", companyId)
    .eq("project_number", match.lookupValue)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return {
    field: "linked_project_id", id: data.id, displayRef: match.lookupValue,
    type: "project", matchSource: match.source, matchedText: match.rawMatch.substring(0, 80),
  };
}

// ── Log system items on case ──
async function logAutoLinkSuccess(admin: any, caseId: string, companyId: string, link: ResolvedLink) {
  await admin.from("case_items").insert({
    case_id: caseId,
    company_id: companyId,
    type: "system",
    subject: "auto_link_success",
    body_preview: `Automatisk koblet til ${link.displayRef} (${link.type}) fra e-post ${link.matchSource}. Matchet tekst: "${link.matchedText}"`,
  });
}

async function logAutoLinkFailed(admin: any, caseId: string, companyId: string, match: IdMatch, reason: string) {
  await admin.from("case_items").insert({
    case_id: caseId,
    company_id: companyId,
    type: "system",
    subject: "auto_link_failed",
    body_preview: `ID funnet (${match.lookupValue}, type: ${match.type}) i ${match.source}, men ${reason}.`,
  });
}

async function logSuggestedLink(admin: any, caseId: string, companyId: string, match: IdMatch) {
  await admin.from("case_items").insert({
    case_id: caseId,
    company_id: companyId,
    type: "system",
    subject: "suggested_link",
    body_preview: `Tall "${match.rawMatch}" funnet i ${match.source}. Mulig referanse – verifiser manuelt.`,
  });
}

/** Check if a case has an existing manual link for a given field (set via LinkToExistingDialog or user action) */
async function hasManualLink(admin: any, caseId: string, field: string): Promise<boolean> {
  // A manual link is indicated by a system event from user action (not auto_link_success)
  const { data } = await admin.from("case_items")
    .select("id")
    .eq("case_id", caseId)
    .eq("type", "system")
    .in("subject", ["Koblet til eksisterende", "Tildelt", "Konvertert til lead"])
    .limit(1);
  return (data && data.length > 0);
}

/** Log a suggested link when auto-link is blocked by existing manual link */
async function logSuggestedAutoLink(admin: any, caseId: string, companyId: string, link: ResolvedLink) {
  await admin.from("case_items").insert({
    case_id: caseId,
    company_id: companyId,
    type: "system",
    subject: "suggested_link",
    body_preview: `Auto-kobling til ${link.displayRef} (${link.type}) blokkert – eksisterende manuell kobling bevart. Verifiser manuelt om ønskelig.`,
  });
}

// ── Download & store email attachments ──
async function downloadAndStoreAttachments(
  msToken: string,
  mailboxAddress: string,
  messageId: string,
  caseId: string,
  companyId: string,
  admin: any,
  jobId: string | null, // linked job/project UUID if any
): Promise<{ meta: any[]; documentIds: string[] }> {
  const attachmentsMeta: any[] = [];
  const documentIds: string[] = [];

  try {
    const url = `${GRAPH_BASE}/users/${encodeURIComponent(mailboxAddress)}/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${msToken}` } });
    if (!res.ok) {
      console.error(`[inbox-sync] Attachments list error: ${res.status}`);
      return { meta: [], documentIds: [] };
    }
    const data = await res.json();
    const attachments = (data.value || []).filter((a: any) => !a.isInline && a["@odata.type"] === "#microsoft.graph.fileAttachment");

    for (const att of attachments.slice(0, 10)) { // Max 10 per email
      try {
        // Download attachment content
        const contentUrl = `${GRAPH_BASE}/users/${encodeURIComponent(mailboxAddress)}/messages/${messageId}/attachments/${att.id}`;
        const contentRes = await fetch(contentUrl, { headers: { Authorization: `Bearer ${msToken}` } });
        if (!contentRes.ok) continue;
        const contentData = await contentRes.json();
        const base64Content = contentData.contentBytes;
        if (!base64Content) continue;

        // Decode base64 to Uint8Array
        const binaryStr = atob(base64Content);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

        // Upload to storage
        const safeName = (att.name || "attachment").replace(/[^\w.\-()]/g, "_");
        const storagePath = `${companyId}/email/${caseId}/${crypto.randomUUID()}-${safeName}`;

        const { error: uploadErr } = await admin.storage
          .from("email-attachments")
          .upload(storagePath, bytes, { contentType: att.contentType || "application/octet-stream" });

        if (uploadErr) {
          console.error(`[inbox-sync] Upload error: ${uploadErr.message}`);
          continue;
        }

        // Create document record
        const entityId = jobId || caseId;
        const entityType = jobId ? "job" : "case";

        const { data: docRow, error: docErr } = await admin.from("documents").insert({
          entity_type: entityType,
          entity_id: entityId,
          file_name: att.name || "attachment",
          file_path: storagePath,
          mime_type: att.contentType || "application/octet-stream",
          file_size: att.size || bytes.length,
          storage_bucket: "email-attachments",
          company_id: companyId,
          source_type: "email",
          category: "other", // Will be classified by AI
        }).select("id").single();

        if (docErr) {
          console.error(`[inbox-sync] Document insert error: ${docErr.message}`);
        } else {
          documentIds.push(docRow.id);
        }

        attachmentsMeta.push({
          filename: att.name,
          size: att.size,
          contentType: att.contentType,
          storagePath,
          documentId: docRow?.id || null,
        });
      } catch (attErr) {
        console.error(`[inbox-sync] Attachment processing error:`, attErr);
      }
    }
  } catch (err) {
    console.error(`[inbox-sync] Attachments download error:`, err);
  }

  return { meta: attachmentsMeta, documentIds };
}

// ── Trigger AI classification for document IDs ──
async function triggerClassification(documentIds: string[], supabaseUrl: string, serviceRoleKey: string) {
  if (documentIds.length === 0) return;
  try {
    await fetch(`${supabaseUrl}/functions/v1/classify-attachment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ document_ids: documentIds }),
    });
    console.log(`[inbox-sync] Triggered classification for ${documentIds.length} attachments`);
  } catch (err) {
    console.error("[inbox-sync] Classification trigger error:", err);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

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

    const supabaseAuthed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: authedUser }, error: userErr } = await supabaseAuthed.auth.getUser();
    if (userErr || !authedUser) return respond({ error: "Invalid session" }, 401);
    const userId = authedUser.id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const msToken = await getAppToken();
    if (!msToken) return respond({ error: "Kunne ikke hente applikasjonstoken for Microsoft Graph." }, 500);

    const { data: mailboxes } = await supabaseAdmin
      .from("mailboxes").select("address, display_name, graph_delta_link, id").eq("is_enabled", true);
    const enabledMailboxes = mailboxes || [];

    const { data: routingRules } = await supabaseAdmin
      .from("case_routing_rules").select("*").eq("is_enabled", true);
    const rules = routingRules || [];

    const { data: companies } = await supabaseAdmin
      .from("internal_companies").select("id").eq("is_active", true).limit(1);
    const companyId = companies?.[0]?.id;
    if (!companyId) return respond({ error: "No active company found" }, 400);

    const { data: soSettings } = await supabaseAdmin
      .from("superoffice_settings").select("*").eq("company_id", companyId).maybeSingle();

    const defaultScope = soSettings?.default_case_scope || "company";
    const defaultStatus = soSettings?.default_case_status || "new";
    const defaultPriority = soSettings?.default_priority || "normal";
    const autoTriageEnabled = soSettings?.auto_triage_enabled || false;
    const autoAssignEnabled = soSettings?.auto_assign_enabled || false;
    const autoAssignSalesUserId = soSettings?.auto_assign_sales_user_id || null;
    const autoAssignServiceUserId = soSettings?.auto_assign_service_user_id || null;

    const sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let totalFetched = 0, totalNewCases = 0, totalNewItems = 0, totalSkipped = 0, totalLinked = 0;
    const allDocumentIds: string[] = [];

    for (const mb of enabledMailboxes) {
      console.log(`[inbox-sync] Fetching from: ${mb.address}`);
      let mbError: string | null = null;
      let mbCount = 0;

      try {
        const { messages, newDeltaLink } = await fetchMailboxMessages(
          msToken, mb.address, sinceDate, true, mb.graph_delta_link
        );
        console.log(`[inbox-sync] Got ${messages.length} messages from ${mb.address}`);
        totalFetched += messages.length;
        mbCount = messages.length;

        if (newDeltaLink) {
          await supabaseAdmin.from("mailboxes").update({ graph_delta_link: newDeltaLink }).eq("address", mb.address);
        }

        for (const msg of messages) {
          // Skip duplicates
          const { data: existingItem } = await supabaseAdmin
            .from("case_items").select("id, case_id").eq("external_id", msg.id).maybeSingle();
          if (existingItem) { totalSkipped++; continue; }

          const threadId = msg.conversationId || msg.id;
          const originalSubject = msg.subject || "(Ingen emne)";
          const normalizedSubject = normalizeSubject(originalSubject);
          const fromEmail = msg.from?.emailAddress?.address || "";
          const fromName = msg.from?.emailAddress?.name || "";
          const bodyPreview = (msg.bodyPreview || "").substring(0, 500);
          const bodyHtml = msg.body?.content || null;
          const bodyText = bodyHtml ? stripHtml(bodyHtml).substring(0, 5000) : bodyPreview;
          const sentAt = msg.sentDateTime || msg.receivedDateTime || null;
          const internetMessageId = msg.internetMessageId || null;
          const conversationId = msg.conversationId || null;
          const toRecipients = (msg.toRecipients || []).map((r: any) => r.emailAddress?.address).filter(Boolean);
          const ccRecipients = (msg.ccRecipients || []).map((r: any) => r.emailAddress?.address).filter(Boolean);

          // Extract In-Reply-To and References from internetMessageHeaders
          const headers = msg.internetMessageHeaders || [];
          const inReplyTo = headers.find((h: any) => h.name?.toLowerCase() === "in-reply-to")?.value || null;
          const referencesHeader = headers.find((h: any) => h.name?.toLowerCase() === "references")?.value || null;

          // ── EXTRACT IDs ──
          const extracted = extractAllIds(normalizedSubject, bodyText);
          let caseId: string | null = null;
          const linkedUpdates: Record<string, string> = {};
          const resolvedLinks: ResolvedLink[] = [];
          const failedMatches: { match: IdMatch; reason: string }[] = [];

          // 1. Try CASE IDs first — find existing case to attach to
          for (const caseMatch of extracted.caseIds) {
            const resolvedCaseId = await resolveCaseId(caseMatch, companyId, supabaseAdmin);
            if (resolvedCaseId) {
              caseId = resolvedCaseId;
              console.log(`[inbox-sync] Matched case ${caseMatch.lookupValue} -> ${caseId}`);
              break;
            } else {
              failedMatches.push({ match: caseMatch, reason: "objekt ikke funnet i samme firma" });
            }
          }

          // 2. Priority order: JOB > PROJECT > OFFER > LEAD — resolve and link
          const orderedMatches: IdMatch[] = [
            ...extracted.jobIds,
            ...extracted.projectIds,
            ...extracted.offerIds,
            ...extracted.leadIds,
          ];

          if (orderedMatches.length > 1) {
            console.log(`[inbox-sync] Multiple IDs found: ${orderedMatches.map(m => m.lookupValue).join(", ")}. Using priority: JOB > PROJECT > OFFER > LEAD.`);
          }

          for (const idMatch of orderedMatches) {
            let resolved: ResolvedLink | null = null;
            switch (idMatch.type) {
              case "job": resolved = await resolveJobId(idMatch, companyId, supabaseAdmin); break;
              case "project": resolved = await resolveProjectId(idMatch, companyId, supabaseAdmin); break;
              case "offer": resolved = await resolveOfferId(idMatch, companyId, supabaseAdmin); break;
              case "lead": resolved = await resolveLeadId(idMatch, companyId, supabaseAdmin); break;
            }
            if (resolved) {
              if (!linkedUpdates[resolved.field]) {
                linkedUpdates[resolved.field] = resolved.id;
                resolvedLinks.push(resolved);
              }
            } else {
              failedMatches.push({ match: idMatch, reason: "objekt ikke funnet i samme firma" });
            }
          }

          // 3. Find or create case
          // 3a. Try to find case by thread_id
          if (!caseId) {
            const { data: existingCase } = await supabaseAdmin
              .from("cases").select("id").eq("thread_id", threadId).eq("company_id", companyId).maybeSingle();
            if (existingCase) caseId = existingCase.id;
          }

          // 3b. Fallback: use In-Reply-To / References for threading
          if (!caseId && inReplyTo) {
            const { data: replyItem } = await supabaseAdmin
              .from("case_items")
              .select("case_id")
              .eq("internet_message_id", inReplyTo)
              .eq("company_id", companyId)
              .maybeSingle();
            if (replyItem) {
              caseId = replyItem.case_id;
              console.log(`[inbox-sync] Matched case via In-Reply-To header -> ${caseId}`);
            }
          }
          if (!caseId && referencesHeader) {
            // References header contains space-separated message IDs; try matching any
            const refIds = referencesHeader.split(/\s+/).filter(Boolean).slice(0, 5);
            for (const refId of refIds) {
              const { data: refItem } = await supabaseAdmin
                .from("case_items")
                .select("case_id")
                .eq("internet_message_id", refId)
                .eq("company_id", companyId)
                .maybeSingle();
              if (refItem) {
                caseId = refItem.case_id;
                console.log(`[inbox-sync] Matched case via References header -> ${caseId}`);
                break;
              }
            }
          }

          if (caseId) {
            // Update existing case — protect manual links from being overwritten
            const updatePayload: any = {
              updated_at: new Date().toISOString(),
              last_activity_at: new Date().toISOString(),
            };

            // Check if case already has a manual link for each field
            const safeLinkedUpdates: Record<string, string> = {};
            const blockedLinks: ResolvedLink[] = [];

            if (Object.keys(linkedUpdates).length > 0) {
              // Fetch current case to check existing links
              const { data: currentCase } = await supabaseAdmin
                .from("cases")
                .select("linked_work_order_id, linked_project_id, linked_lead_id, linked_offer_id")
                .eq("id", caseId)
                .single();

              for (const [field, id] of Object.entries(linkedUpdates)) {
                const existingValue = currentCase?.[field as keyof typeof currentCase];
                if (existingValue && existingValue !== id) {
                  // Field already has a different link — check if it was manual
                  const isManual = await hasManualLink(supabaseAdmin, caseId, field);
                  if (isManual) {
                    // Don't overwrite manual link, log suggestion instead
                    const link = resolvedLinks.find(l => l.field === field);
                    if (link) blockedLinks.push(link);
                    console.log(`[inbox-sync] Blocked auto-link ${field}=${id} on case ${caseId} — manual link exists (${existingValue})`);
                    continue;
                  }
                }
                safeLinkedUpdates[field] = id;
              }

              if (Object.keys(safeLinkedUpdates).length > 0) {
                Object.assign(updatePayload, safeLinkedUpdates);
                totalLinked++;
              }
            }
            await supabaseAdmin.from("cases").update(updatePayload).eq("id", caseId);

            // Log successful auto-links (only the ones that were applied)
            for (const link of resolvedLinks) {
              if (blockedLinks.includes(link)) {
                await logSuggestedAutoLink(supabaseAdmin, caseId, companyId, link);
              } else if (safeLinkedUpdates[link.field]) {
                await logAutoLinkSuccess(supabaseAdmin, caseId, companyId, link);
              }
            }
            // Log failed matches
            for (const f of failedMatches) {
              await logAutoLinkFailed(supabaseAdmin, caseId, companyId, f.match, f.reason);
            }
            // Log standalone number suggestions (never auto-link)
            for (const sn of extracted.standaloneNumbers) {
              await logSuggestedLink(supabaseAdmin, caseId, companyId, sn);
            }
          } else {
            // Create new case
            const ai = autoTriageEnabled
              ? classifyMessage(originalSubject, bodyPreview)
              : { category: "general", urgency: "normal", recommended_next_action: "none" };
            const routing = applyRoutingRules(rules, originalSubject, bodyPreview, fromEmail, mb.address);

            let autoOwner = routing.owner_user_id || null;
            if (!autoOwner && autoAssignEnabled) {
              if (["quote_request", "order"].includes(ai.category) && autoAssignSalesUserId)
                autoOwner = autoAssignSalesUserId;
              else if (["technical", "urgent_support", "site_visit"].includes(ai.category) && autoAssignServiceUserId)
                autoOwner = autoAssignServiceUserId;
            }

            const hasLinks = Object.keys(linkedUpdates).length > 0;
            const newCase: any = {
              company_id: companyId,
              title: originalSubject,
              status: routing.status || (hasLinks ? "triage" : (autoTriageEnabled && ai.urgency !== "normal" ? "triage" : defaultStatus)),
              priority: routing.priority || (autoTriageEnabled ? (ai.urgency === "critical" ? "critical" : ai.urgency === "high" ? "high" : defaultPriority) : defaultPriority),
              next_action: routing.next_action || (autoTriageEnabled ? ai.recommended_next_action : "none") || "none",
              scope: routing.scope || defaultScope,
              mailbox_address: mb.address,
              thread_id: threadId,
              owner_user_id: autoOwner,
              ...linkedUpdates,
            };

            const { data: createdCase, error: caseErr } = await supabaseAdmin
              .from("cases").insert(newCase).select("id").single();
            if (caseErr) {
              console.error(`[inbox-sync] Case create error: ${caseErr.message}`);
              totalSkipped++;
              continue;
            }
            caseId = createdCase.id;
            totalNewCases++;
            if (hasLinks) totalLinked++;

            // Log successful auto-links
            for (const link of resolvedLinks) {
              await logAutoLinkSuccess(supabaseAdmin, caseId, companyId, link);
            }
            // Log failed matches
            for (const f of failedMatches) {
              await logAutoLinkFailed(supabaseAdmin, caseId, companyId, f.match, f.reason);
            }
            // Log standalone number suggestions
            for (const sn of extracted.standaloneNumbers) {
              await logSuggestedLink(supabaseAdmin, caseId, companyId, sn);
            }
          }

          // Insert case_item with full email data including threading headers
          const { error: itemErr } = await supabaseAdmin.from("case_items").insert({
            company_id: companyId,
            case_id: caseId,
            type: "email",
            external_id: msg.id,
            subject: originalSubject,
            subject_normalized: normalizedSubject,
            from_email: fromEmail || fromName || null,
            from_name: fromName || null,
            body_preview: bodyPreview,
            body_html: bodyHtml,
            body_text: bodyText,
            sent_at: sentAt,
            internet_message_id: internetMessageId,
            conversation_id: conversationId,
            in_reply_to: inReplyTo,
            references_header: referencesHeader,
            to_emails: toRecipients.length > 0 ? toRecipients : null,
            cc_emails: ccRecipients.length > 0 ? ccRecipients : null,
            received_at: msg.receivedDateTime || new Date().toISOString(),
            created_by: userId,
          });

          if (itemErr) {
            console.error(`[inbox-sync] Item insert error: ${itemErr.message}`);
            totalSkipped++;
          } else {
            totalNewItems++;

            // Download and store email attachments if present
            if (msg.hasAttachments && caseId) {
              const linkedJobId = linkedUpdates["linked_work_order_id"] || linkedUpdates["linked_project_id"] || null;
              const { meta: attMeta, documentIds: attDocIds } = await downloadAndStoreAttachments(
                msToken, mb.address, msg.id, caseId, companyId, supabaseAdmin, linkedJobId
              );

              // Update case_item with attachment metadata
              if (attMeta.length > 0) {
                const { data: insertedItem } = await supabaseAdmin
                  .from("case_items")
                  .select("id")
                  .eq("external_id", msg.id)
                  .maybeSingle();
                if (insertedItem) {
                  await supabaseAdmin.from("case_items")
                    .update({ attachments_meta: attMeta })
                    .eq("id", insertedItem.id);
                }
              }

              // Trigger AI classification
              if (attDocIds.length > 0) {
                allDocumentIds.push(...attDocIds);
              }
            }
          }

          // Backwards compat: upsert inbox_messages
          await supabaseAdmin.from("inbox_messages").upsert(
            {
              external_id: msg.id,
              subject: originalSubject,
              from_name: fromName || null,
              from_email: fromEmail || null,
              received_at: msg.receivedDateTime || new Date().toISOString(),
              body_preview: bodyPreview,
              body_full: bodyHtml,
              has_attachments: msg.hasAttachments || false,
              fetched_by: userId,
              status: "new",
              mailbox_address: mb.address,
              visibility: "team",
            },
            { onConflict: "external_id", ignoreDuplicates: true }
          );
        }
      } catch (syncErr: any) {
        mbError = syncErr.message || "Unknown sync error";
        console.error(`[inbox-sync] Error syncing ${mb.address}: ${mbError}`);
      }

      await supabaseAdmin.from("mailboxes").update({
        last_sync_at: new Date().toISOString(),
        last_sync_error: mbError,
        last_sync_count: mbCount,
      }).eq("id", mb.id);
    }

    if (enabledMailboxes.length === 0) console.log("[inbox-sync] No shared mailboxes configured.");

    // Trigger AI classification for all new email attachments
    if (allDocumentIds.length > 0) {
      await triggerClassification(
        allDocumentIds,
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
    }

    console.log(`[inbox-sync] Done. Fetched: ${totalFetched}, New cases: ${totalNewCases}, New items: ${totalNewItems}, Linked: ${totalLinked}, Skipped: ${totalSkipped}, Attachments classified: ${allDocumentIds.length}`);

    return respond({
      success: true,
      fetched: totalFetched,
      new_cases: totalNewCases,
      new_items: totalNewItems,
      linked: totalLinked,
      skipped: totalSkipped,
      mailboxes_synced: enabledMailboxes.length || 1,
    });
  } catch (err) {
    console.error("[inbox-sync] Fatal error:", err);
    return respond({ error: String(err) }, 500);
  }
});
