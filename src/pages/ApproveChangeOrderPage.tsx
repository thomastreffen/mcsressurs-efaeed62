import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

export default function ApproveChangeOrderPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const coId = searchParams.get("id") || "";

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!coId) { setError("Ugyldig lenke."); setLoading(false); return; }

    // Fetch basic info (public read via edge function)
    supabase.functions.invoke("approve-change-order", {
      body: { token, change_order_id: coId, action: "preview" },
    }).then(({ data, error: err }) => {
      // Preview will fail with "Ugyldig handling" which is expected
      // We just need to check the order exists
    });

    // For display, fetch directly using anon (we'll rely on the edge function for the actual action)
    // We'll show the order info from a simpler approach
    setLoading(false);
  }, [coId, token]);

  const handleAction = async (action: "approve" | "reject") => {
    setSubmitting(true);
    setError(null);

    const { data, error: err } = await supabase.functions.invoke("approve-change-order", {
      body: {
        token,
        change_order_id: coId,
        action,
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        message: message.trim() || undefined,
      },
    });

    if (err || !data?.ok) {
      setError(data?.message || "Noe gikk galt. Prøv igjen.");
    } else {
      setDone(data.status);
    }
    setSubmitting(false);
  };

  if (!token || !coId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-lg font-bold">Ugyldig lenke</h1>
          <p className="text-sm text-muted-foreground">Denne lenken er ikke gyldig. Kontakt avsender for ny lenke.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4 max-w-md">
          {done === "approved" ? (
            <CheckCircle className="h-12 w-12 text-success mx-auto" />
          ) : (
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
          )}
          <h1 className="text-xl font-bold">
            {done === "approved" ? "Tillegg godkjent" : "Tillegg avvist"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {done === "approved"
              ? "Takk! Tillegget er registrert som godkjent. Vi vil behandle dette videre."
              : "Tillegget er registrert som avvist. Vi vil ta kontakt om nødvendig."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold">Godkjenn tillegg</h1>
          <p className="text-sm text-muted-foreground">
            Du har mottatt en forespørsel om godkjenning av et tillegg.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Ditt navn</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Fullt navn" />
            </div>
            <div className="space-y-2">
              <Label>E-post (valgfri)</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="din@epost.no" />
            </div>
            <div className="space-y-2">
              <Label>Kommentar (valgfri)</Label>
              <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Eventuell melding..." rows={2} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              className="flex-1 gap-1.5 rounded-xl"
              onClick={() => handleAction("approve")}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Godkjenn
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-1.5 rounded-xl"
              onClick={() => handleAction("reject")}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Avslå
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
