import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function ensureValidMsToken(
  supabaseAdmin: any,
  userId: string,
  meta: any
): Promise<string | null> {
  const accessToken = meta.ms_access_token;
  const refreshToken = meta.ms_refresh_token;
  const expiresAt = meta.ms_expires_at;

  if (!accessToken) return null;

  if (expiresAt && new Date(expiresAt).getTime() > Date.now() + 5 * 60 * 1000) {
    return accessToken;
  }

  if (!refreshToken) return null;

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${Deno.env.get("AZURE_TENANT_ID")}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("AZURE_CLIENT_ID")!,
        client_secret: Deno.env.get("AZURE_CLIENT_SECRET")!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "https://graph.microsoft.com/.default offline_access",
      }),
    }
  );

  if (!tokenRes.ok) {
    await tokenRes.text();
    return null;
  }

  const tokenData = await tokenRes.json();
  const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      ms_access_token: tokenData.access_token,
      ms_refresh_token: tokenData.refresh_token || refreshToken,
      ms_expires_at: newExpiry,
    },
  });

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
    // Use delta link for incremental sync
    url = deltaLink;
  } else {
    const filter = `receivedDateTime ge ${sinceDate}`;
    const basePath = isShared
      ? `${GRAPH_BASE}/users/${encodeURIComponent(mailboxAddress)}/messages`
      : `${GRAPH_BASE}/me/messages`;
    url = `${basePath}?$filter=${encodeURIComponent(filter)}&$top=50&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,body,from,receivedDateTime,hasAttachments,isDraft,conversationId`;
  }

  const allMessages: any[] = [];
  let newDeltaLink: string | null = null;

  // Paginate through results
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
    allMessages.push(...msgs);

    nextLink = graphData["@odata.nextLink"] || null;
    if (graphData["@odata.deltaLink"]) {
      newDeltaLink = graphData["@odata.deltaLink"];
    }
  }

  return { messages: allMessages, newDeltaLink };
}

// AI classification heuristics for MCS tavle/skinne world
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

    const jwt = authHeader.replace("Bearer ", "");
    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: claimsErr } = await supabaseAnon.auth.getClaims(jwt);
    if (claimsErr || !claimsData?.claims) {
      return respond({ error: "Invalid session" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userErr || !userData?.user) {
      return respond({ error: "User not found" }, 404);
    }

    const meta = userData.user.user_metadata || {};
    const msToken = await ensureValidMsToken(supabaseAdmin, userId, meta);
    if (!msToken) {
      return respond({ error: "Microsoft-tilkobling mangler. Koble til via Integrasjoner.", ms_reauth: true }, 401);
    }

    // Fetch enabled mailboxes
    const { data: mailboxes } = await supabaseAdmin
      .from("mailboxes")
      .select("address, display_name, graph_delta_link")
      .eq("is_enabled", true);

    const enabledMailboxes = mailboxes || [];

    // Fetch routing rules
    const { data: routingRules } = await supabaseAdmin
      .from("case_routing_rules")
      .select("*")
      .eq("is_enabled", true);

    const rules = routingRules || [];

    // Get first active company for tenant
    const { data: companies } = await supabaseAdmin
      .from("internal_companies")
      .select("id")
      .eq("is_active", true)
      .limit(1);
    const companyId = companies?.[0]?.id;
    if (!companyId) {
      return respond({ error: "No active company found" }, 400);
    }

    console.log(`[inbox-sync] Syncing ${enabledMailboxes.length} mailbox(es) for user ${userId}`);

    const sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let totalFetched = 0;
    let totalNewCases = 0;
    let totalNewItems = 0;
    let totalSkipped = 0;

    for (const mb of enabledMailboxes) {
      console.log(`[inbox-sync] Fetching from: ${mb.address}`);
      const { messages, newDeltaLink } = await fetchMailboxMessages(
        msToken, mb.address, sinceDate, true, mb.graph_delta_link
      );
      console.log(`[inbox-sync] Got ${messages.length} messages from ${mb.address}`);
      totalFetched += messages.length;

      // Save delta link
      if (newDeltaLink) {
        await supabaseAdmin
          .from("mailboxes")
          .update({ graph_delta_link: newDeltaLink })
          .eq("address", mb.address);
      }

      for (const msg of messages) {
        // Check if case_item already exists (dedup via external_id)
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
        const subject = msg.subject || "(Ingen emne)";
        const fromEmail = msg.from?.emailAddress?.address || "";
        const fromName = msg.from?.emailAddress?.name || "";
        const bodyPreview = (msg.bodyPreview || "").substring(0, 500);
        const bodyHtml = msg.body?.content || null;

        // Find existing case by thread_id
        let caseId: string | null = null;
        const { data: existingCase } = await supabaseAdmin
          .from("cases")
          .select("id")
          .eq("thread_id", threadId)
          .eq("company_id", companyId)
          .maybeSingle();

        if (existingCase) {
          caseId = existingCase.id;
          // Update case updated_at
          await supabaseAdmin
            .from("cases")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", caseId);
        } else {
          // Create new case
          const ai = classifyMessage(subject, bodyPreview);
          const routing = applyRoutingRules(rules, subject, bodyPreview, fromEmail, mb.address);

          const newCase = {
            company_id: companyId,
            title: subject,
            status: routing.status || "new",
            priority: routing.priority || (ai.urgency === "critical" ? "critical" : ai.urgency === "high" ? "high" : "normal"),
            next_action: routing.next_action || ai.recommended_next_action || "none",
            scope: routing.scope || "company",
            mailbox_address: mb.address,
            thread_id: threadId,
            owner_user_id: routing.owner_user_id || null,
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
        }

        // Create case_item
        const { error: itemErr } = await supabaseAdmin
          .from("case_items")
          .insert({
            company_id: companyId,
            case_id: caseId,
            type: "email",
            external_id: msg.id,
            subject: subject,
            from_email: fromEmail || fromName || null,
            body_preview: bodyPreview,
            body_html: bodyHtml,
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
              subject: subject,
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
    }

    // Fallback: personal inbox if no shared mailboxes
    if (enabledMailboxes.length === 0) {
      console.log(`[inbox-sync] No shared mailboxes. Fetching personal inbox.`);
      const { messages } = await fetchMailboxMessages(msToken, "", sinceDate, false, null);
      totalFetched = messages.length;

      for (const msg of messages) {
        const { data: existingItem } = await supabaseAdmin
          .from("case_items")
          .select("id")
          .eq("external_id", msg.id)
          .maybeSingle();

        if (existingItem) { totalSkipped++; continue; }

        const threadId = msg.conversationId || msg.id;
        const subject = msg.subject || "(Ingen emne)";

        let caseId: string | null = null;
        const { data: existingCase } = await supabaseAdmin
          .from("cases")
          .select("id")
          .eq("thread_id", threadId)
          .eq("company_id", companyId)
          .maybeSingle();

        if (existingCase) {
          caseId = existingCase.id;
          await supabaseAdmin.from("cases").update({ updated_at: new Date().toISOString() }).eq("id", caseId);
        } else {
          const ai = classifyMessage(subject, msg.bodyPreview || "");
          const { data: createdCase, error: caseErr } = await supabaseAdmin
            .from("cases")
            .insert({
              company_id: companyId,
              title: subject,
              status: "new",
              priority: ai.urgency === "critical" ? "critical" : "normal",
              next_action: ai.recommended_next_action || "none",
              scope: "company",
              mailbox_address: "personal",
              thread_id: threadId,
            })
            .select("id")
            .single();
          if (caseErr) { totalSkipped++; continue; }
          caseId = createdCase.id;
          totalNewCases++;
        }

        const { error: itemErr } = await supabaseAdmin
          .from("case_items")
          .insert({
            company_id: companyId,
            case_id: caseId,
            type: "email",
            external_id: msg.id,
            subject: subject,
            from_email: msg.from?.emailAddress?.address || null,
            body_preview: (msg.bodyPreview || "").substring(0, 500),
            body_html: msg.body?.content || null,
            received_at: msg.receivedDateTime || new Date().toISOString(),
            created_by: userId,
          });
        if (itemErr) totalSkipped++;
        else totalNewItems++;

        // Backwards compat
        await supabaseAdmin.from("inbox_messages").upsert({
          external_id: msg.id,
          subject: subject,
          from_name: msg.from?.emailAddress?.name || null,
          from_email: msg.from?.emailAddress?.address || null,
          received_at: msg.receivedDateTime || new Date().toISOString(),
          body_preview: (msg.bodyPreview || "").substring(0, 500),
          body_full: msg.body?.content || null,
          has_attachments: msg.hasAttachments || false,
          fetched_by: userId,
          status: "new",
          mailbox_address: "personal",
          visibility: "team",
        }, { onConflict: "external_id", ignoreDuplicates: true });
      }
    }

    console.log(`[inbox-sync] Done. Fetched: ${totalFetched}, New cases: ${totalNewCases}, New items: ${totalNewItems}, Skipped: ${totalSkipped}`);

    return respond({
      success: true,
      fetched: totalFetched,
      new_cases: totalNewCases,
      new_items: totalNewItems,
      skipped: totalSkipped,
      mailboxes_synced: enabledMailboxes.length || 1,
    });
  } catch (err) {
    console.error("[inbox-sync] Fatal error:", err);
    return respond({ error: String(err) }, 500);
  }
});
