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
    const supabase = createClient(supabaseUrl, serviceKey);

    const { token, change_order_id, action, name, email, message } = await req.json();

    if (!token || !change_order_id || !action) {
      return new Response(
        JSON.stringify({ ok: false, message: "Mangler påkrevde felt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action !== "approve" && action !== "reject") {
      return new Response(
        JSON.stringify({ ok: false, message: "Ugyldig handling" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch change order
    const { data: co, error: coErr } = await supabase
      .from("job_change_orders")
      .select("*")
      .eq("id", change_order_id)
      .single();

    if (coErr || !co) {
      return new Response(
        JSON.stringify({ ok: false, message: "Tillegg ikke funnet" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify status
    if (co.status !== "sent") {
      return new Response(
        JSON.stringify({ ok: false, message: "Dette tillegget er allerede besvart eller ikke sendt ennå." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiry
    if (co.approval_expires_at && new Date(co.approval_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ ok: false, message: "Godkjenningslenken har utløpt. Kontakt oss for ny lenke." }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify token hash
    const tokenHash = await hashToken(token);
    if (tokenHash !== co.approval_token_hash) {
      return new Response(
        JSON.stringify({ ok: false, message: "Ugyldig godkjenningslenke." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    // Update
    await supabase.from("job_change_orders").update({
      status: newStatus,
      responded_at: new Date().toISOString(),
      response_message: message || null,
      approved_by_name: name || null,
      approved_by_email: email || null,
      approval_method: "link",
    }).eq("id", change_order_id);

    // Log event
    const eventMessage = action === "approve"
      ? `Tillegget ble godkjent av ${name || "kunde"}`
      : `Tillegget ble avvist av ${name || "kunde"}${message ? `: ${message}` : ""}`;

    await supabase.from("job_change_order_events").insert({
      change_order_id,
      job_id: co.job_id,
      event_type: newStatus,
      event_message: eventMessage,
      actor_type: "customer",
      actor_name: name || co.customer_name || "Kunde",
      actor_email: email || co.customer_email || null,
    });

    return new Response(
      JSON.stringify({ ok: true, status: newStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[approve-change-order] Error:", err);
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
