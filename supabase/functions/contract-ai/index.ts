import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims)
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const userId = claimsData.claims.sub as string;
    const { action, contract_id, text_override } = await req.json();

    if (action === "analyze_contract") {
      if (!contract_id) throw new Error("contract_id required");
      if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

      // Get contract info
      const { data: contract } = await supabaseAdmin
        .from("contracts")
        .select("company_id, job_id, risk_level")
        .eq("id", contract_id)
        .single();

      const previousRiskLevel = contract?.risk_level || "green";

      let extractedText = "";

      // Check for text_override first (paste fallback)
      if (text_override && typeof text_override === "string" && text_override.trim().length > 0) {
        extractedText = text_override.trim();
      } else {
        // Get primary document
        const { data: doc, error: docErr } = await supabaseAdmin
          .from("contract_documents")
          .select("*")
          .eq("contract_id", contract_id)
          .eq("is_primary", true)
          .order("version", { ascending: false })
          .limit(1)
          .single();

        if (docErr || !doc)
          return new Response(JSON.stringify({ error: "No primary document found" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });

        // Download file from storage
        const { data: fileData, error: fileErr } = await supabaseAdmin.storage
          .from("contract-documents")
          .download(doc.file_path);

        if (fileErr || !fileData)
          return new Response(JSON.stringify({ error: "Could not download document" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });

        // Extract text - for PDF, use base64 for vision model
        const arrayBuf = await fileData.arrayBuffer();

        if (doc.mime_type === "application/pdf") {
          const bytes = new Uint8Array(arrayBuf).slice(0, 100000);
          const base64 = btoa(String.fromCharCode(...bytes));

          // Check if PDF has extractable text (heuristic: look for text stream markers)
          const textCheck = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(arrayBuf).slice(0, 50000));
          const hasText = (textCheck.match(/\([\w\s]{10,}\)/g) || []).length > 5 ||
                          textCheck.includes("/Type /Page");

          if (arrayBuf.byteLength < 1000 && !hasText) {
            return new Response(JSON.stringify({
              error: "PDF-filen ser ut til å mangle lesbar tekst. Bruk «Lim inn tekst» for å analysere manuelt.",
              error_code: "pdf_text_missing",
            }), {
              status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          extractedText = `[PDF_BASE64:${base64}]`;
        } else {
          // Text-based document
          extractedText = new TextDecoder().decode(new Uint8Array(arrayBuf));
        }
      }

      // Check text length
      if (extractedText.length < 800 && !extractedText.startsWith("[PDF_BASE64:")) {
        return new Response(JSON.stringify({
          error: "For lite tekst hentet fra dokumentet. Bruk «Lim inn tekst» for å analysere manuelt.",
          error_code: "pdf_text_missing",
        }), {
          status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build AI message content
      const isPdfBase64 = extractedText.startsWith("[PDF_BASE64:");
      let userContent: any[];
      if (isPdfBase64) {
        const base64 = extractedText.slice(12, -1);
        userContent = [
          { type: "text", text: `Analyser denne kontrakten og trekk ut all relevant informasjon.` },
          { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
        ];
      } else {
        userContent = [
          { type: "text", text: `Analyser denne kontrakten og trekk ut all relevant informasjon:\n\n${extractedText.substring(0, 50000)}` },
        ];
      }

      // Call AI
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `Du er en ekspert kontraktanalytiker for elektrobransjen i Norge. Analyser kontraktdokumentet og trekk ut strukturert informasjon. Vær presis og konservativ i risikovurderingen. Alle datoer i ISO 8601-format (YYYY-MM-DD). Hvis du ikke finner informasjon, returner null. Risk score 0-100 der 0 er lav risiko.`,
            },
            { role: "user", content: userContent },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "analyze_contract",
                description: "Return structured contract analysis",
                parameters: {
                  type: "object",
                  properties: {
                    summaries: {
                      type: "object",
                      properties: {
                        pl: { type: "string", description: "Sammendrag for prosjektleder (2-4 setninger)" },
                        econ: { type: "string", description: "Sammendrag for økonomiansvarlig (2-4 setninger)" },
                        field: { type: "string", description: "Sammendrag for montør/feltpersonell (2-4 setninger)" },
                      },
                      required: ["pl", "econ", "field"],
                    },
                    extracted: {
                      type: "object",
                      properties: {
                        end_date: { type: ["string", "null"], description: "Sluttdato ISO 8601" },
                        signed_date: { type: ["string", "null"], description: "Signeringsdato ISO 8601" },
                        start_date: { type: ["string", "null"], description: "Startdato ISO 8601" },
                        warranty_months: { type: ["integer", "null"], description: "Garantiperiode i måneder" },
                        penalty_type: { type: ["string", "null"], description: "Dagbot-type" },
                        penalty_rate: { type: ["number", "null"], description: "Dagbot-sats" },
                        penalty_unit: { type: ["string", "null"], description: "Dagbot-enhet" },
                        contract_type: { type: ["string", "null"], description: "Kontraktstype" },
                      },
                      required: ["end_date", "signed_date", "warranty_months", "penalty_type", "penalty_rate", "penalty_unit"],
                    },
                    deadlines: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          type: { type: "string", enum: ["completion", "milestone", "notice", "documentation", "warranty_end", "other"] },
                          title: { type: "string" },
                          due_date: { type: "string" },
                          severity: { type: "string", enum: ["info", "warn", "critical"] },
                        },
                        required: ["type", "title", "due_date", "severity"],
                      },
                    },
                    risk_score: { type: "integer" },
                    risk_level: { type: "string", enum: ["green", "yellow", "red"] },
                    confidence: { type: "integer" },
                  },
                  required: ["summaries", "extracted", "deadlines", "risk_score", "risk_level", "confidence"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "analyze_contract" } },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429)
          return new Response(JSON.stringify({ error: "Rate limit exceeded", error_code: "rate_limit" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        if (status === 402)
          return new Response(JSON.stringify({ error: "Payment required", error_code: "payment_required" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        const errText = await aiResponse.text();
        console.error("AI error:", status, errText);
        throw new Error(`AI gateway error: ${status}`);
      }

      const aiResult = await aiResponse.json();
      const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No structured output from AI");

      const analysis = JSON.parse(toolCall.function.arguments);

      // Upsert contract with analysis results
      const updateData: any = {
        ai_summary_pl: analysis.summaries.pl,
        ai_summary_econ: analysis.summaries.econ,
        ai_summary_field: analysis.summaries.field,
        risk_score: analysis.risk_score,
        risk_level: analysis.risk_level,
        ai_confidence: analysis.confidence,
        last_analyzed_at: new Date().toISOString(),
        last_analyzed_by: userId,
      };

      if (analysis.extracted.end_date) updateData.end_date = analysis.extracted.end_date;
      if (analysis.extracted.signed_date) updateData.signed_date = analysis.extracted.signed_date;
      if (analysis.extracted.start_date) updateData.start_date = analysis.extracted.start_date;
      if (analysis.extracted.warranty_months != null) updateData.warranty_months = analysis.extracted.warranty_months;
      if (analysis.extracted.penalty_type) updateData.penalty_type = analysis.extracted.penalty_type;
      if (analysis.extracted.penalty_rate != null) updateData.penalty_rate = analysis.extracted.penalty_rate;
      if (analysis.extracted.penalty_unit) updateData.penalty_unit = analysis.extracted.penalty_unit;
      if (analysis.extracted.contract_type) updateData.contract_type = analysis.extracted.contract_type;

      await supabaseAdmin.from("contracts").update(updateData).eq("id", contract_id);

      // Insert deadlines
      if (analysis.deadlines?.length > 0) {
        const deadlineRows = analysis.deadlines.map((d: any) => ({
          company_id: contract?.company_id,
          contract_id,
          job_id: contract?.job_id || null,
          type: d.type,
          title: d.title,
          due_date: d.due_date,
          severity: d.severity,
          notify_days_before: d.severity === "critical" ? [30, 14, 7, 3, 1, 0] : [30, 14, 7, 2, 0],
        }));
        await supabaseAdmin.from("contract_deadlines").insert(deadlineRows);
      }

      // Create alerts for nearest deadlines
      const nearDeadlines = (analysis.deadlines || [])
        .filter((d: any) => {
          const dueDate = new Date(d.due_date);
          const daysUntil = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return daysUntil <= 30 && daysUntil >= 0;
        });

      if (nearDeadlines.length > 0) {
        const alertRows = nearDeadlines.map((d: any) => ({
          company_id: contract?.company_id,
          contract_id,
          job_id: contract?.job_id || null,
          alert_type: "deadline_upcoming",
          severity: d.severity,
          title: `Frist nærmer seg: ${d.title}`,
          message: `Frist ${d.due_date} for "${d.title}". Sjekk kontrakten for detaljer.`,
          due_date: d.due_date,
        }));
        await supabaseAdmin.from("contract_alerts").insert(alertRows);
      }

      // Update job snapshot if linked
      if (contract?.job_id) {
        const { data: openDeadlines } = await supabaseAdmin
          .from("contract_deadlines")
          .select("due_date, severity")
          .eq("contract_id", contract_id)
          .eq("status", "open")
          .order("due_date", { ascending: true })
          .limit(10);

        let nextDeadline: string | null = null;
        if (openDeadlines && openDeadlines.length > 0) {
          const earliest = openDeadlines[0].due_date;
          const sameDateItems = openDeadlines.filter(d => d.due_date === earliest);
          const critical = sameDateItems.find(d => d.severity === "critical");
          nextDeadline = critical ? critical.due_date : earliest;
        }

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { count: alertCount } = await supabaseAdmin
          .from("contract_alerts")
          .select("id", { count: "exact", head: true })
          .eq("contract_id", contract_id)
          .eq("is_read", false)
          .in("severity", ["warn", "critical"])
          .gte("created_at", thirtyDaysAgo.toISOString());

        await supabaseAdmin.from("events").update({
          contract_risk_level: analysis.risk_level,
          next_contract_deadline: nextDeadline,
          contract_alert_count: alertCount || 0,
        }).eq("id", contract.job_id);
      }

      // --- Audit logs ---
      // contract_analyzed
      await supabaseAdmin.from("activity_log").insert({
        entity_id: contract_id,
        entity_type: "contract",
        action: "contract_analyzed",
        type: "system",
        performed_by: userId,
        description: `AI-analyse fullført. Risikoscore: ${analysis.risk_score}/100 (${analysis.risk_level}). Konfidensgrad: ${analysis.confidence}%.`,
        metadata: { risk_score: analysis.risk_score, risk_level: analysis.risk_level, confidence: analysis.confidence },
      });

      // contract_risk_level_changed
      if (previousRiskLevel !== analysis.risk_level) {
        await supabaseAdmin.from("activity_log").insert({
          entity_id: contract_id,
          entity_type: "contract",
          action: "contract_risk_level_changed",
          type: "system",
          performed_by: userId,
          description: `Risikonivå endret fra ${previousRiskLevel} til ${analysis.risk_level}.`,
          metadata: { from: previousRiskLevel, to: analysis.risk_level },
        });
      }

      return new Response(JSON.stringify({ ok: true, analysis }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    if (err.name === "AbortError") {
      return new Response(JSON.stringify({ error: "AI analysis timed out", error_code: "ai_timeout" }), {
        status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("contract-ai error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
