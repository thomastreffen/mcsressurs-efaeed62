import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const { caseTitle, emailBodies, companyId } = await req.json();

    const prompt = `Du er en assistent for en norsk elektro- og tavlebygger-bedrift.
Analyser følgende henvendelse og foreslå et tilbudsutkast.

Henvendelse-tittel: ${caseTitle}

E-posthistorikk:
${emailBodies || "(ingen e-poster)"}

Returner et JSON-objekt med følgende felter:
{
  "customer_name": "Bedriftsnavn utledet fra e-post",
  "contact_name": "Kontaktperson utledet fra e-post",
  "contact_email": "E-postadresse",
  "summary": "Kort sammendrag av hva kunden trenger (2-3 setninger)",
  "recommended_next_step": "Anbefalt neste steg (f.eks. befaring, oppfølgingssamtale)",
  "pricing_structure": {
    "materials": "Foreslått materiellbeskrivelse basert på forespørselen",
    "labor": "Foreslått arbeidsbeskrivelse",
    "reservations": "Eventuelle forbehold"
  },
  "confidence": 0.7
}

Returner KUN gyldig JSON, ingen annen tekst.`;

    // Use Lovable AI (Gemini)
    const aiRes = await fetch("https://nmqycanqumelmfpdmkpr.supabase.co/functions/v1/ai-proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI proxy error:", errText);
      throw new Error("AI analysis failed");
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse AI response");
    
    const draft = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(draft), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("case-offer-ai-draft error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
