import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const supabaseAnon = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser(jwt);
    if (authErr || !user) {
      return new Response(JSON.stringify({ ok: false, message: "Ikke autentisert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { change_order_id } = await req.json();
    if (!change_order_id) {
      return new Response(JSON.stringify({ ok: false, message: "change_order_id mangler" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch change order
    const { data: co, error: coErr } = await supabase
      .from("job_change_orders")
      .select("*")
      .eq("id", change_order_id)
      .single();

    if (coErr || !co) {
      return new Response(JSON.stringify({ ok: false, message: "Tillegg ikke funnet" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (co.status !== "draft") {
      return new Response(JSON.stringify({ ok: false, message: "Kan bare sende utkast" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate token
    const token = crypto.randomUUID();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // Update status
    await supabase.from("job_change_orders").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      approval_token_hash: tokenHash,
      approval_expires_at: expiresAt,
    }).eq("id", change_order_id);

    // Log event
    await supabase.from("job_change_order_events").insert({
      change_order_id,
      job_id: co.job_id,
      event_type: "sent",
      event_message: `Tillegg sendt til ${co.customer_email || "kunde"}`,
      actor_type: "user",
      actor_name: user.user_metadata?.full_name || user.email,
      actor_email: user.email,
    });

    // Build approval URL
    const origin = req.headers.get("origin") || `${supabaseUrl.replace(".supabase.co", "")}`;
    // Use a known frontend URL pattern
    const approvalUrl = `${origin}/approve-change-order?token=${token}&id=${change_order_id}`;

    // Fetch job info for context
    const { data: job } = await supabase.from("events").select("title, internal_number").eq("id", co.job_id).single();
    const jobLabel = job?.internal_number || job?.title || co.job_id;

    const amountIncVat = Number(co.amount_ex_vat) * (1 + Number(co.vat_rate) / 100);

    // Try to send via Microsoft Graph
    let emailSent = false;
    if (co.customer_email) {
      try {
        // Get user's MS token
        const { data: userData } = await supabase.auth.admin.getUserById(user.id);
        const msToken = userData?.user?.user_metadata?.ms_access_token;

        if (msToken) {
          const emailBody = `
<p>Hei ${co.customer_name || ""},</p>
<p>Vi har et tillegg på jobb <strong>${jobLabel}</strong> som vi trenger godkjenning for:</p>
<h3>${co.title}</h3>
<p>${co.description}</p>
${co.schedule_impact ? `<p><strong>Fremdriftskonsekvens:</strong> ${co.schedule_impact}</p>` : ""}
<p><strong>Beløp eks. mva:</strong> ${co.currency} ${Number(co.amount_ex_vat).toLocaleString("nb-NO")}</p>
<p><strong>Beløp inkl. mva:</strong> ${co.currency} ${amountIncVat.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}</p>
<br/>
<p>Vennligst bruk lenken nedenfor for å godkjenne eller avslå:</p>
<p><a href="${approvalUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;">Se og besvar tillegg</a></p>
<br/>
<p>Med vennlig hilsen</p>
          `.trim();

          const graphRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${msToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                subject: `Tillegg: ${co.title} [${jobLabel}]`,
                body: { contentType: "HTML", content: emailBody },
                toRecipients: [{ emailAddress: { address: co.customer_email } }],
              },
            }),
          });

          emailSent = graphRes.ok;
          if (!graphRes.ok) {
            console.error("[send-change-order] Graph error:", await graphRes.text());
          }
        }
      } catch (e) {
        console.error("[send-change-order] Email error:", e);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, emailSent, approvalUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-change-order] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
