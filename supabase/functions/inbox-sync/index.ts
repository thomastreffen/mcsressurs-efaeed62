import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function getAppToken(): Promise<string | null> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");

  if (!tenantId || !clientId || !clientSecret) {
    console.error("[inbox-sync] Missing Azure env vars for client_credentials flow");
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
    console.error(`[inbox-sync] client_credentials token error: ${tokenRes.status} ${errText.substring(0, 300)}`);
    return null;
  }

  const tokenData = await tokenRes.json();
  console.log("[inbox-sync] Acquired APPLICATION token via client_credentials flow");
  return tokenData.access_token;
}

async function fetchMailboxMessages(
  msToken: string,
  mailboxAddress: string,
  sinceDate: string,
  isShared: boolean,
  deltaLink: string | null
): Promise<{ messages: any[]; newDeltaLink: string | null }> {
  let url: string;

  if (deltaLink) {
    url = deltaLink;
    console.log(`[inbox-sync][DEBUG] Using deltaLink for ${mailboxAddress}`);
  } else if (isShared) {
    const inboxPath = `${GRAPH_BASE}/users/${encodeURIComponent(mailboxAddress)}/mailFolders/Inbox/messages/delta`;
    url = `${inboxPath}?$top=50&$select=id,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,hasAttachments,isDraft,conversationId,internetMessageId`;
    console.log(`[inbox-sync][DEBUG] Shared mailbox endpoint: /users/${mailboxAddress}/mailFolders/Inbox/messages/delta`);
  } else {
    const inboxPath = `${GRAPH_BASE}/users/${encodeURIComponent(mailboxAddress)}/mailFolders/Inbox/messages`;
    const filter = `receivedDateTime ge ${sinceDate}`;
    url = `${inboxPath}?$filter=${encodeURIComponent(filter)}&$top=50&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,hasAttachments,isDraft,conversationId,internetMessageId`;
    console.log(`[inbox-sync][DEBUG] Personal mailbox endpoint: /users/${mailboxAddress}/mailFolders/Inbox/messages`);
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
    console.log(`[inbox-sync][DEBUG] Page returned ${msgs.length} messages`);
    if (msgs.length > 0) {
      console.log(`[inbox-sync][DEBUG] First subject: "${msgs[0].subject}"`);
    }
    allMessages.push(...msgs);

    nextLink = graphData["@odata.nextLink"] || null;
    if (graphData["@odata.deltaLink"]) {
      newDeltaLink = graphData["@odata.deltaLink"];
    }
  }

  return { messages: allMessages, newDeltaLink };
}

// AI classification heuristics
function classifyMessage(subject: string, bodyPreview: string): {
  category: string;
  urgency: string;
  recommended_next_action: string;
} {
  const text = `${subject} ${bodyPreview}`.toLowerCase();

  if (text.match(/feil|haste|kritisk|akutt|stopp|nedetid/)) {
    return { category: "urgent_support", urgency: "critical", recommended_next_action: "call" };
  }
  if (text.match(/bestilling|ordre|po\b|vi aksepterer|vi bestiller|bekreft/)) {
    return { category: "order", urgency: "high", recommended_next_action: "schedule" };
  }
  if (text.match(/tilbud|pris|kostnadsestimat|gi pris|prisforespørsel|forespørsel/)) {
    return { category: "quote_request", urgency: "normal", recommended_next_action: "quote" };
  }
  if (text.match(/tavle|samleskinne|busbar|strømskinne|skinne|bryter|ampere|enlinje/)) {
    return { category: "technical", urgency: "normal", recommended_next_action: "clarify" };
  }
  if (text.match(/schneider|eaton|siemens|3va|pxr|ups|generator|aggregat|datasenter|abb|rittal/)) {
    return { category: "technical", urgency: "normal", recommended_next_action: "clarify" };
  }
  if (text.match(/125a|160a|250a|400a|630a|800a|1000a|1250a|1600a/)) {
    return { category: "technical", urgency: "normal", recommended_next_action: "clarify" };
  }
  if (text.match(/faktura|betaling|kreditnota/)) {
    return { category: "invoice", urgency: "normal", recommended_next_action: "document" };
  }
  if (text.match(/befaring|prosjekt|anlegg|installasjon/)) {
    return { category: "site_visit", urgency: "normal", recommended_next_action: "schedule" };
  }

  return { category: "general", urgency: "normal", recommended_next_action: "none" };
}

// Apply routing rules
function applyRoutingRules(
  rules: any[],
  subject: string,
  bodyPreview: string,
  fromEmail: string,
  mailboxAddress: string
): { priority?: string; status?: string; next_action?: string; owner_user_id?: string; scope?: string } {
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
    if (rule.from_contains && fromEmail.toLowerCase().includes(rule.from_contains.toLowerCase())) {
      matched = true;
    }

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

// ── Normalize subject: strip reply/forward prefixes ──
function normalizeSubject(raw: string): string {
  let s = raw.trim();
  // Repeatedly strip re:/sv:/vs:/fw:/fwd: prefixes (case-insensitive)
  while (/^(re|sv|vs|fw|fwd)\s*:\s*/i.test(s)) {
    s = s.replace(/^(re|sv|vs|fw|fwd)\s*:\s*/i, "").trim();
  }
  return s;
}

// ── Strip HTML tags for plain text extraction ──
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// ── ID matching engine ──
interface IdMatch {
  type: "case" | "job" | "offer" | "lead";
  pattern: string;
  rawMatch: string;
  lookupValue: string; // The normalized value to search for in DB
}

function extractIds(text: string): IdMatch[] {
  const matches: IdMatch[] = [];
  const seen = new Set<string>();

  // CASE: [CASE-000001] or CASE-000001
  for (const m of text.matchAll(/[\[\(]?(CASE-(\d{6}))[\]\)]?/gi)) {
    const key = `case:CASE-${m[2]}`;
    if (!seen.has(key)) { seen.add(key); matches.push({ type: "case", pattern: "full_case", rawMatch: m[0], lookupValue: `CASE-${m[2]}` }); }
  }

  // JOB: JOB-000010
  for (const m of text.matchAll(/\bJOB-(\d{6})\b/gi)) {
    const key = `job:JOB-${m[1]}`;
    if (!seen.has(key)) { seen.add(key); matches.push({ type: "job", pattern: "full_job", rawMatch: m[0], lookupValue: `JOB-${m[1]}` }); }
  }

  // OFFER: MCS-2026-0001 format
  for (const m of text.matchAll(/\bMCS-(\d{4})-(\d{4})\b/gi)) {
    const key = `offer:${m[0].toUpperCase()}`;
    if (!seen.has(key)) { seen.add(key); matches.push({ type: "offer", pattern: "mcs_offer", rawMatch: m[0], lookupValue: m[0].toUpperCase() }); }
  }

  // LEAD: LEAD-2026-000001
  for (const m of text.matchAll(/\bLEAD-(\d{4})-(\d{6})\b/gi)) {
    const key = `lead:${m[0].toUpperCase()}`;
    if (!seen.has(key)) { seen.add(key); matches.push({ type: "lead", pattern: "full_lead", rawMatch: m[0], lookupValue: m[0].toUpperCase() }); }
  }

  // Standalone 6-digit (only if no other matches found yet for dedup)
  if (matches.length === 0) {
    const sixMatch = text.match(/\b(\d{6})\b/);
    if (sixMatch) {
      matches.push({ type: "case", pattern: "6_digit", rawMatch: sixMatch[0], lookupValue: `CASE-${sixMatch[1]}` });
    }
  }

  // Short prefix: #1, case 1, sak 1
  if (matches.length === 0) {
    const shortMatch = text.match(/(?:#|(?:case|sak)\s+)(\d{1,5})\b/i);
    if (shortMatch) {
      matches.push({ type: "case", pattern: "short_prefix", rawMatch: shortMatch[0], lookupValue: `CASE-${shortMatch[1].padStart(6, "0")}` });
    }
  }

  return matches;
}

async function resolveIdMatch(
  match: IdMatch,
  companyId: string,
  supabaseAdmin: any
): Promise<{ linkedField: string; linkedId: string; objectLabel: string } | null> {
  switch (match.type) {
    case "case": {
      const { data } = await supabaseAdmin
        .from("cases").select("id").eq("case_number", match.lookupValue).eq("company_id", companyId).maybeSingle();
      return data ? { linkedField: "case_id", linkedId: data.id, objectLabel: match.lookupValue } : null;
    }
    case "job": {
      // Search by internal_number (JOB-XXXXXX) or job_number
      const { data } = await supabaseAdmin
        .from("events").select("id").or(`internal_number.eq.${match.lookupValue},job_number.eq.${match.lookupValue}`).eq("company_id", companyId).maybeSingle();
      return data ? { linkedField: "linked_work_order_id", linkedId: data.id, objectLabel: match.lookupValue } : null;
    }
    case "offer": {
      const { data } = await supabaseAdmin
        .from("offers").select("id").eq("offer_number", match.lookupValue).maybeSingle();
      return data ? { linkedField: "linked_offer_id", linkedId: data.id, objectLabel: match.lookupValue } : null;
    }
    case "lead": {
      const { data } = await supabaseAdmin
        .from("leads").select("id").eq("lead_ref_code", match.lookupValue).maybeSingle();
      return data ? { linkedField: "linked_lead_id", linkedId: data.id, objectLabel: match.lookupValue } : null;
    }
  }
  return null;
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
    if (!authHeader?.startsWith("Bearer ")) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const supabaseAuthed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: authedUser }, error: userErr } = await supabaseAuthed.auth.getUser();
    if (userErr || !authedUser) {
      return respond({ error: "Invalid session" }, 401);
    }
    const userId = authedUser.id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const msToken = await getAppToken();
    if (!msToken) {
      return respond({ error: "Kunne ikke hente applikasjonstoken for Microsoft Graph. Sjekk Azure-konfigurasjon." }, 500);
    }
    console.log("[inbox-sync] Auth mode: APPLICATION (client_credentials).");

    const { data: mailboxes } = await supabaseAdmin
      .from("mailboxes")
      .select("address, display_name, graph_delta_link, id")
      .eq("is_enabled", true);

    const enabledMailboxes = mailboxes || [];

    const { data: routingRules } = await supabaseAdmin
      .from("case_routing_rules")
      .select("*")
      .eq("is_enabled", true);

    const rules = routingRules || [];

    const { data: companies } = await supabaseAdmin
      .from("internal_companies")
      .select("id")
      .eq("is_active", true)
      .limit(1);
    const companyId = companies?.[0]?.id;
    if (!companyId) {
      return respond({ error: "No active company found" }, 400);
    }

    const { data: soSettings } = await supabaseAdmin
      .from("superoffice_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    const defaultScope = soSettings?.default_case_scope || "company";
    const defaultStatus = soSettings?.default_case_status || "new";
    const defaultPriority = soSettings?.default_priority || "normal";
    const autoTriageEnabled = soSettings?.auto_triage_enabled || false;
    const autoAssignEnabled = soSettings?.auto_assign_enabled || false;
    const autoAssignSalesUserId = soSettings?.auto_assign_sales_user_id || null;
    const autoAssignServiceUserId = soSettings?.auto_assign_service_user_id || null;

    const sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let totalFetched = 0;
    let totalNewCases = 0;
    let totalNewItems = 0;
    let totalSkipped = 0;
    let totalLinked = 0;

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
        await supabaseAdmin
          .from("mailboxes")
          .update({ graph_delta_link: newDeltaLink })
          .eq("address", mb.address);
      }

      for (const msg of messages) {
        const { data: existingItem } = await supabaseAdmin
          .from("case_items")
          .select("id, case_id")
          .eq("external_id", msg.id)
          .maybeSingle();

        if (existingItem) {
          totalSkipped++;
          continue;
        }

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

        // Extract to/cc recipients
        const toRecipients = (msg.toRecipients || []).map((r: any) => r.emailAddress?.address).filter(Boolean);
        const ccRecipients = (msg.ccRecipients || []).map((r: any) => r.emailAddress?.address).filter(Boolean);

        // ── Build matchText from normalized subject + body ──
        const matchText = normalizedSubject + "\n" + bodyText;

        // ── Extract IDs from matchText ──
        const idMatches = extractIds(matchText);
        let caseId: string | null = null;
        let linkedUpdates: Record<string, string> = {};
        let matchLog: string | null = null;

        // Try to resolve each ID match
        for (const idm of idMatches) {
          const resolved = await resolveIdMatch(idm, companyId, supabaseAdmin);
          if (resolved) {
            if (idm.type === "case") {
              // Direct case match — attach to that case
              caseId = resolved.linkedId;
              matchLog = `Matchet ${resolved.objectLabel} via ${idm.pattern} i ${idm.rawMatch}`;
              console.log(`[inbox-sync] ${matchLog}`);
              break;
            } else {
              // JOB/OFFER/LEAD — link to case
              linkedUpdates[resolved.linkedField] = resolved.linkedId;
              matchLog = `Matchet ${resolved.objectLabel} (${idm.type}) via ${idm.pattern} — koblet til ${resolved.linkedField}`;
              console.log(`[inbox-sync] ${matchLog}`);
            }
          } else {
            // ID found but object doesn't exist
            console.warn(`[inbox-sync] ID funnet men objekt ikke funnet: ${idm.lookupValue} (${idm.type})`);
          }
        }

        // If we have linked updates (JOB/OFFER/LEAD) but no case yet, find by conversationId or create new
        if (!caseId) {
          const { data: existingCase } = await supabaseAdmin
            .from("cases")
            .select("id")
            .eq("thread_id", threadId)
            .eq("company_id", companyId)
            .maybeSingle();
          if (existingCase) {
            caseId = existingCase.id;
          }
        }

        if (caseId) {
          // Update existing case
          const updatePayload: any = {
            updated_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          };
          // Apply linked entity updates
          if (Object.keys(linkedUpdates).length > 0) {
            Object.assign(updatePayload, linkedUpdates);
            totalLinked++;
          }
          await supabaseAdmin.from("cases").update(updatePayload).eq("id", caseId);

          // Log system item for match
          if (matchLog) {
            await supabaseAdmin.from("case_items").insert({
              case_id: caseId,
              company_id: companyId,
              type: "system",
              subject: "Automatisk kobling",
              body_preview: matchLog,
            });
          }
        } else {
          // Create new case
          const ai = autoTriageEnabled ? classifyMessage(originalSubject, bodyPreview) : { category: "general", urgency: "normal", recommended_next_action: "none" };
          const routing = applyRoutingRules(rules, originalSubject, bodyPreview, fromEmail, mb.address);

          let autoOwner = routing.owner_user_id || null;
          if (!autoOwner && autoAssignEnabled) {
            if (["quote_request", "order"].includes(ai.category) && autoAssignSalesUserId) {
              autoOwner = autoAssignSalesUserId;
            } else if (["technical", "urgent_support", "site_visit"].includes(ai.category) && autoAssignServiceUserId) {
              autoOwner = autoAssignServiceUserId;
            }
          }

          // If we have linked updates, set status to triage
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
            .from("cases")
            .insert(newCase)
            .select("id")
            .single();

          if (caseErr) {
            console.error(`[inbox-sync] Case create error: ${caseErr.message}`);
            totalSkipped++;
            continue;
          }
          caseId = createdCase.id;
          totalNewCases++;
          if (hasLinks) totalLinked++;

          // Log ID match on new case
          if (matchLog) {
            await supabaseAdmin.from("case_items").insert({
              case_id: caseId,
              company_id: companyId,
              type: "system",
              subject: "Automatisk kobling",
              body_preview: matchLog,
            });
          }

          // Log unresolved IDs
          for (const idm of idMatches) {
            const resolved = await resolveIdMatch(idm, companyId, supabaseAdmin);
            if (!resolved) {
              await supabaseAdmin.from("case_items").insert({
                case_id: caseId,
                company_id: companyId,
                type: "system",
                subject: "ID funnet, men objekt ikke funnet",
                body_preview: `${idm.lookupValue} (${idm.type}) ble funnet i e-post, men objektet finnes ikke i systemet.`,
              });
            }
          }
        }

        // Create case_item with full email data
        const { error: itemErr } = await supabaseAdmin
          .from("case_items")
          .insert({
            company_id: companyId,
            case_id: caseId,
            type: "email",
            external_id: msg.id,
            subject: originalSubject,
            from_email: fromEmail || fromName || null,
            from_name: fromName || null,
            body_preview: bodyPreview,
            body_html: bodyHtml,
            body_text: bodyText,
            sent_at: sentAt,
            internet_message_id: internetMessageId,
            conversation_id: conversationId,
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
        }

        // Also upsert to inbox_messages for backwards compatibility
        await supabaseAdmin
          .from("inbox_messages")
          .upsert(
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

      await supabaseAdmin
        .from("mailboxes")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_error: mbError,
          last_sync_count: mbCount,
        })
        .eq("id", mb.id);
    }
    if (enabledMailboxes.length === 0) {
      console.log(`[inbox-sync] No shared mailboxes configured.`);
    }

    console.log(`[inbox-sync] Done. Fetched: ${totalFetched}, New cases: ${totalNewCases}, New items: ${totalNewItems}, Linked: ${totalLinked}, Skipped: ${totalSkipped}`);

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
