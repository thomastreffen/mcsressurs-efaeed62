import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OFFER_STATUS_CONFIG, type OfferStatus } from "@/lib/offer-status";
import { Loader2, CheckCircle2, FileText, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

export default function OfferAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const [offer, setOffer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error: err } = await supabase
        .from("offers")
        .select("*, calculations(customer_name, project_title, description)")
        .eq("public_token", token)
        .single();

      if (err || !data) {
        setError("Tilbudet ble ikke funnet eller lenken er ugyldig.");
        setLoading(false);
        return;
      }

      if (data.status === "accepted") {
        setAccepted(true);
      }

      setOffer(data);
      setLoading(false);
    })();
  }, [token]);

  const handleAccept = async () => {
    if (!offer) return;
    setAccepting(true);
    try {
      // Get client IP (best effort)
      let clientIp = "unknown";
      try {
        const ipRes = await fetch("https://api.ipify.org?format=json");
        const ipData = await ipRes.json();
        clientIp = ipData.ip;
      } catch {}

      const { error: updateErr } = await supabase
        .from("offers")
        .update({
          status: "accepted" as OfferStatus,
          accepted_at: new Date().toISOString(),
          accepted_ip: clientIp,
        })
        .eq("id", offer.id);

      if (updateErr) throw updateErr;

      // Update calculation status
      await supabase.from("calculations").update({ status: "accepted" }).eq("id", offer.calculation_id);

      // Log activity
      await supabase.from("activity_log").insert({
        entity_type: "offer", entity_id: offer.id, action: "accepted",
        description: `Tilbud digitalt akseptert fra IP ${clientIp}`,
        metadata: { ip: clientIp, timestamp: new Date().toISOString() },
      });

      setAccepted(true);
      setOffer((prev: any) => prev ? { ...prev, status: "accepted" } : null);
    } catch (err: any) {
      setError("Kunne ikke akseptere tilbudet. Prøv igjen.");
    }
    setAccepting(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (error && !offer) return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
          <h2 className="text-lg font-bold">Ugyldig lenke</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    </div>
  );

  const isExpired = offer?.valid_until && new Date(offer.valid_until) < new Date();

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">MCS Service AS</h1>
          <p className="text-sm text-muted-foreground">Elektro • VVS • Kulde</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Tilbud {offer.offer_number}</CardTitle>
              <Badge className={OFFER_STATUS_CONFIG[offer.status as OfferStatus]?.className}>
                {OFFER_STATUS_CONFIG[offer.status as OfferStatus]?.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Kunde:</span>
                <p className="font-medium">{offer.calculations?.customer_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Prosjekt:</span>
                <p className="font-medium">{offer.calculations?.project_title}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Versjon:</span>
                <p className="font-medium">v{offer.version}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Opprettet:</span>
                <p className="font-medium">{format(new Date(offer.created_at), "d. MMM yyyy", { locale: nb })}</p>
              </div>
            </div>

            {offer.calculations?.description && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Beskrivelse</p>
                <p className="text-sm">{offer.calculations.description}</p>
              </div>
            )}

            <div className="rounded-lg border p-4 text-center space-y-1">
              <p className="text-sm text-muted-foreground">Totalpris eks. MVA</p>
              <p className="text-2xl font-bold">kr {Number(offer.total_ex_vat).toLocaleString("nb-NO", { minimumFractionDigits: 2 })}</p>
              <p className="text-lg text-muted-foreground">
                Inkl. MVA: kr {Number(offer.total_inc_vat).toLocaleString("nb-NO", { minimumFractionDigits: 2 })}
              </p>
            </div>

            {offer.valid_until && (
              <p className="text-xs text-muted-foreground text-center">
                Gyldig til: {format(new Date(offer.valid_until), "d. MMMM yyyy", { locale: nb })}
                {isExpired && <span className="text-destructive ml-1">(Utløpt)</span>}
              </p>
            )}

            {offer.generated_pdf_url && (
              <Button variant="outline" className="w-full gap-1.5" onClick={() => window.open(offer.generated_pdf_url, "_blank")}>
                <FileText className="h-4 w-4" /> Se fullstendig tilbud (PDF)
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Terms */}
        <Card>
          <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground text-sm mb-2">Vilkår</p>
            <p>• Priser er eks. MVA med mindre annet er oppgitt.</p>
            <p>• Arbeid utføres i henhold til gjeldende forskrifter (NEK 400, FEK).</p>
            <p>• Uforutsette forhold kan medføre tillegg etter medgått tid og materiell.</p>
            <p>• Betalingsbetingelser: 14 dager netto.</p>
          </CardContent>
        </Card>

        {/* Accept section */}
        {accepted ? (
          <Card className="border-green-200 dark:border-green-800">
            <CardContent className="p-6 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
              <h2 className="text-lg font-bold text-green-800 dark:text-green-200">Tilbudet er akseptert</h2>
              <p className="text-sm text-muted-foreground">
                Akseptert {offer.accepted_at ? format(new Date(offer.accepted_at), "d. MMMM yyyy 'kl' HH:mm", { locale: nb }) : ""}
              </p>
              <p className="text-xs text-muted-foreground">Vi tar kontakt for å planlegge gjennomføring.</p>
            </CardContent>
          </Card>
        ) : isExpired ? (
          <Card className="border-destructive/30">
            <CardContent className="p-6 text-center space-y-3">
              <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
              <h2 className="text-lg font-bold">Tilbudet er utløpt</h2>
              <p className="text-sm text-muted-foreground">Kontakt oss for et oppdatert tilbud.</p>
            </CardContent>
          </Card>
        ) : offer.status === "rejected" ? (
          <Card className="border-destructive/30">
            <CardContent className="p-6 text-center space-y-3">
              <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
              <h2 className="text-lg font-bold">Tilbudet er avslått</h2>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Ved å klikke "Aksepter tilbud" godtar du vilkårene beskrevet i tilbudet.
              </p>
              <Button size="lg" onClick={handleAccept} disabled={accepting} className="gap-2 w-full sm:w-auto">
                {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Aksepter tilbud
              </Button>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          MCS Service AS • Org.nr: 000 000 000 • mcs-service.no
        </p>
      </div>
    </div>
  );
}
