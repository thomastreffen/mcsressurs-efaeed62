import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CheckResult {
  service: string;
  status: "ok" | "warn" | "fail";
  latency_ms: number;
  message: string;
  error_code?: string;
}

async function checkDb(supabaseAdmin: any): Promise<CheckResult> {
  const start = Date.now();
  try {
    const { error } = await supabaseAdmin.from("settings").select("id").limit(1);
    const latency = Date.now() - start;
    if (error) {
      return { service: "database", status: "fail", latency_ms: latency, message: "Databaseforespørsel feilet", error_code: error.code };
    }
    return { service: "database", status: "ok", latency_ms: latency, message: "Database svarer normalt" };
  } catch (e: any) {
    return { service: "database", status: "fail", latency_ms: Date.now() - start, message: e.message, error_code: "db_exception" };
  }
}

async function checkGraph(supabase: any, userId: string): Promise<CheckResult> {
  const start = Date.now();
  try {
    // Check if user has Microsoft tokens
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: tokenRow } = await supabaseAdmin
      .from("microsoft_tokens")
      .select("access_token, expires_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (!tokenRow) {
      return { service: "microsoft_graph", status: "warn", latency_ms: Date.now() - start, message: "Microsoft ikke tilkoblet for denne brukeren", error_code: "not_connected" };
    }

    // Check if token is expired
    if (new Date(tokenRow.expires_at) < new Date()) {
      return { service: "microsoft_graph", status: "warn", latency_ms: Date.now() - start, message: "Microsoft-token er utløpt. Koble til på nytt.", error_code: "token_expired" };
    }

    // Test Graph API
    const graphResp = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenRow.access_token}` },
    });
    const latency = Date.now() - start;

    if (graphResp.ok) {
      return { service: "microsoft_graph", status: "ok", latency_ms: latency, message: "Microsoft Graph svarer normalt" };
    }
    if (graphResp.status === 401 || graphResp.status === 403) {
      return { service: "microsoft_graph", status: "fail", latency_ms: latency, message: "Autentisering feilet. Koble Microsoft til på nytt.", error_code: `graph_${graphResp.status}` };
    }
    return { service: "microsoft_graph", status: "warn", latency_ms: latency, message: `Graph returnerte ${graphResp.status}`, error_code: `graph_${graphResp.status}` };
  } catch (e: any) {
    return { service: "microsoft_graph", status: "fail", latency_ms: Date.now() - start, message: e.message, error_code: "graph_exception" };
  }
}

async function checkAi(): Promise<CheckResult> {
  const start = Date.now();
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return { service: "ai_gateway", status: "fail", latency_ms: 0, message: "LOVABLE_API_KEY ikke konfigurert", error_code: "missing_key" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: "Respond with exactly: pong" }],
        max_tokens: 10,
      }),
    });
    clearTimeout(timer);
    const latency = Date.now() - start;

    if (resp.ok) {
      await resp.text(); // consume body
      return { service: "ai_gateway", status: "ok", latency_ms: latency, message: "AI-gateway svarer normalt" };
    }
    if (resp.status === 429) {
      return { service: "ai_gateway", status: "warn", latency_ms: latency, message: "AI er midlertidig overbelastet", error_code: "rate_limit" };
    }
    if (resp.status === 402) {
      return { service: "ai_gateway", status: "fail", latency_ms: latency, message: "AI-kreditter er oppbrukt", error_code: "payment_required" };
    }
    return { service: "ai_gateway", status: "fail", latency_ms: latency, message: `AI returnerte ${resp.status}`, error_code: `ai_${resp.status}` };
  } catch (e: any) {
    clearTimeout(timer);
    const latency = Date.now() - start;
    if (e.name === "AbortError") {
      return { service: "ai_gateway", status: "fail", latency_ms: latency, message: "AI-gateway svarte ikke innen 5 sekunder", error_code: "ai_timeout" };
    }
    return { service: "ai_gateway", status: "fail", latency_ms: latency, message: e.message, error_code: "ai_exception" };
  }
}

async function checkEdgeFunctions(): Promise<CheckResult> {
  const start = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const criticalFunctions = ["regulation-query", "generate-calculation-ai", "outlook-sync"];
  const results: { name: string; ok: boolean }[] = [];

  for (const fn of criticalFunctions) {
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
        method: "OPTIONS",
      });
      results.push({ name: fn, ok: resp.status < 500 });
    } catch {
      results.push({ name: fn, ok: false });
    }
  }

  const latency = Date.now() - start;
  const failed = results.filter(r => !r.ok);

  if (failed.length === 0) {
    return { service: "edge_functions", status: "ok", latency_ms: latency, message: `Alle ${criticalFunctions.length} kritiske funksjoner svarer` };
  }
  if (failed.length < criticalFunctions.length) {
    return { service: "edge_functions", status: "warn", latency_ms: latency, message: `${failed.map(f => f.name).join(", ")} svarer ikke`, error_code: "partial_failure" };
  }
  return { service: "edge_functions", status: "fail", latency_ms: latency, message: "Ingen edge functions svarer", error_code: "total_failure" };
}

async function checkContractCron(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: lastRun } = await supabaseAdmin
      .from("contract_cron_runs")
      .select("ran_at, status, error_code")
      .eq("dry_run", false)
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const latency = Date.now() - start;

    if (!lastRun) {
      return { service: "contract_cron", status: "warn", latency_ms: latency, message: "Cron har aldri kjørt", error_code: "never_run" };
    }

    const hoursSince = (Date.now() - new Date(lastRun.ran_at).getTime()) / (1000 * 60 * 60);

    if (lastRun.status !== "ok") {
      return { service: "contract_cron", status: "fail", latency_ms: latency, message: `Siste kjøring feilet: ${lastRun.error_code || "ukjent"}`, error_code: lastRun.error_code || "last_run_failed" };
    }

    if (hoursSince > 24) {
      return { service: "contract_cron", status: "warn", latency_ms: latency, message: `Siste kjøring var for ${Math.round(hoursSince)} timer siden`, error_code: "stale" };
    }

    return { service: "contract_cron", status: "ok", latency_ms: latency, message: `Siste kjøring OK for ${Math.round(hoursSince)} timer siden` };
  } catch (e: any) {
    return { service: "contract_cron", status: "fail", latency_ms: Date.now() - start, message: e.message, error_code: "cron_check_exception" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // Verify admin role
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin");
    // Alternative: check via has_role
    const { data: hasAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: hasSuperAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: user.id, _role: "super_admin" });

    if (!hasAdmin && !hasSuperAdmin) {
      return new Response(JSON.stringify({ error: "Krever admin-tilgang" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action } = await req.json();

    let results: CheckResult[] = [];

    if (action === "all" || !action) {
      // Run all checks in parallel
      results = await Promise.all([
        checkDb(supabaseAdmin),
        checkGraph(supabase, user.id),
        checkAi(),
        checkEdgeFunctions(),
        checkContractCron(),
      ]);
    } else {
      switch (action) {
        case "db_check": results = [await checkDb(supabaseAdmin)]; break;
        case "graph_check": results = [await checkGraph(supabase, user.id)]; break;
        case "ai_check": results = [await checkAi()]; break;
        case "edge_check": results = [await checkEdgeFunctions()]; break;
        case "cron_check": results = [await checkContractCron()]; break;
      }
    }

    return new Response(JSON.stringify({
      checked_at: new Date().toISOString(),
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("system-health error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: e.message === "Unauthorized" ? 401 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
