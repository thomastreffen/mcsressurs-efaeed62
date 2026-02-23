import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ArrowRight, ArrowLeft, Send, Save } from "lucide-react";
import { REASON_TYPE_LABELS } from "@/lib/change-order-labels";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  customer?: string;
  customerEmail?: string;
  onCreated: () => void;
}

export function CreateChangeOrderDialog({ open, onOpenChange, jobId, customer, customerEmail, onCreated }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // Step 1
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reasonType, setReasonType] = useState("other");
  const [scheduleImpact, setScheduleImpact] = useState("");

  // Step 2
  const [amountExVat, setAmountExVat] = useState("");
  const [vatRate, setVatRate] = useState("25");
  const [costMaterial, setCostMaterial] = useState("");
  const [costLaborHours, setCostLaborHours] = useState("");
  const [costLaborRate, setCostLaborRate] = useState("1080");

  // Step 3
  const [custName, setCustName] = useState(customer || "");
  const [custEmail, setCustEmail] = useState(customerEmail || "");

  const reset = () => {
    setStep(1);
    setTitle(""); setDescription(""); setReasonType("other"); setScheduleImpact("");
    setAmountExVat(""); setVatRate("25"); setCostMaterial(""); setCostLaborHours(""); setCostLaborRate("1080");
    setCustName(customer || ""); setCustEmail(customerEmail || "");
  };

  const amount = Number(amountExVat) || 0;
  const vat = Number(vatRate) || 25;
  const matCost = Number(costMaterial) || 0;
  const laborH = Number(costLaborHours) || 0;
  const laborR = Number(costLaborRate) || 1080;
  const costTotal = matCost + laborH * laborR;
  const marginAmount = amount - costTotal;
  const marginPercent = amount > 0 ? (marginAmount / amount) * 100 : 0;
  const amountIncVat = amount * (1 + vat / 100);

  const canProceedStep1 = title.trim() && description.trim();
  const canProceedStep2 = amount > 0;

  const handleSaveDraft = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("job_change_orders").insert({
      job_id: jobId,
      title: title.trim(),
      description: description.trim(),
      reason_type: reasonType,
      schedule_impact: scheduleImpact.trim() || null,
      amount_ex_vat: amount,
      vat_rate: vat,
      cost_material: costMaterial ? matCost : null,
      cost_labor_hours: costLaborHours ? laborH : null,
      cost_labor_rate: laborR,
      customer_name: custName.trim() || null,
      customer_email: custEmail.trim() || null,
      status: "draft",
      created_by: user.id,
    } as any);

    if (error) {
      toast.error("Kunne ikke lagre tillegg", { description: error.message });
    } else {
      toast.success("Tillegg lagret som utkast");
      reset();
      onCreated();
    }
    setSaving(false);
  };

  const handleSendToCustomer = async () => {
    if (!user || !custEmail.trim()) {
      toast.error("E-postadresse til kunde mangler");
      return;
    }
    setSending(true);

    // 1. Create draft
    const { data: inserted, error: insertErr } = await supabase.from("job_change_orders").insert({
      job_id: jobId,
      title: title.trim(),
      description: description.trim(),
      reason_type: reasonType,
      schedule_impact: scheduleImpact.trim() || null,
      amount_ex_vat: amount,
      vat_rate: vat,
      cost_material: costMaterial ? matCost : null,
      cost_labor_hours: costLaborHours ? laborH : null,
      cost_labor_rate: laborR,
      customer_name: custName.trim() || null,
      customer_email: custEmail.trim() || null,
      status: "draft",
      created_by: user.id,
    } as any).select("id").single();

    if (insertErr || !inserted) {
      toast.error("Kunne ikke opprette tillegg");
      setSending(false);
      return;
    }

    // 2. Send via edge function
    const { error: sendErr } = await supabase.functions.invoke("send-change-order", {
      body: { change_order_id: inserted.id },
    });

    if (sendErr) {
      toast.error("Tillegg opprettet, men sending feilet", { description: String(sendErr) });
    } else {
      toast.success("Tillegg sendt til kunde");
    }

    reset();
    onCreated();
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            Nytt tillegg – Steg {step} av 3
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex gap-1 mb-2">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tittel *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="F.eks. Tillegg for ekstra kabelføring" />
            </div>
            <div className="space-y-2">
              <Label>Beskrivelse *</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Beskriv hva tillegget gjelder..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Årsak</Label>
              <Select value={reasonType} onValueChange={setReasonType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REASON_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fremdriftskonsekvens (valgfri)</Label>
              <Input value={scheduleImpact} onChange={e => setScheduleImpact(e.target.value)} placeholder="F.eks. +1 dag" />
            </div>
            <div className="flex justify-end">
              <Button disabled={!canProceedStep1} onClick={() => setStep(2)} className="gap-1.5 rounded-xl">
                Neste <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Beløp eks. mva *</Label>
                <Input type="number" value={amountExVat} onChange={e => setAmountExVat(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>MVA-sats (%)</Label>
                <Input type="number" value={vatRate} onChange={e => setVatRate(e.target.value)} />
              </div>
            </div>
            <div className="rounded-xl border border-border/40 bg-muted/30 p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Beløp inkl. mva</p>
              <p className="text-sm font-bold font-mono">NOK {amountIncVat.toLocaleString("nb-NO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
            </div>

            <div className="border-t border-border/40 pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Intern kalkyle (valgfri – kunden ser kun pris)</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Materiell</Label>
                  <Input type="number" value={costMaterial} onChange={e => setCostMaterial(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Timer</Label>
                  <Input type="number" value={costLaborHours} onChange={e => setCostLaborHours(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Timepris</Label>
                  <Input type="number" value={costLaborRate} onChange={e => setCostLaborRate(e.target.value)} />
                </div>
              </div>
              {(costMaterial || costLaborHours) && (
                <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Kost: </span>
                    <span className="font-mono font-medium">NOK {costTotal.toLocaleString("nb-NO")}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Margin: </span>
                    <span className="font-mono font-medium">NOK {marginAmount.toLocaleString("nb-NO")}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Margin: </span>
                    <span className="font-mono font-medium">{marginPercent.toFixed(1)}%</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-1.5 rounded-xl">
                <ArrowLeft className="h-3.5 w-3.5" /> Tilbake
              </Button>
              <Button disabled={!canProceedStep2} onClick={() => setStep(3)} className="gap-1.5 rounded-xl">
                Neste <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Kundenavn</Label>
                <Input value={custName} onChange={e => setCustName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Kunde e-post</Label>
                <Input type="email" value={custEmail} onChange={e => setCustEmail(e.target.value)} />
              </div>
            </div>

            {/* Preview */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Forhåndsvisning av kundevarsel</p>
              <div className="text-sm space-y-1">
                <p><strong>{title}</strong></p>
                <p className="text-muted-foreground">{description}</p>
                <p className="font-mono font-medium mt-2">
                  Beløp: NOK {amount.toLocaleString("nb-NO")} eks. mva (NOK {amountIncVat.toLocaleString("nb-NO", { maximumFractionDigits: 0 })} inkl. mva)
                </p>
                {scheduleImpact && (
                  <p className="text-muted-foreground">Fremdriftskonsekvens: {scheduleImpact}</p>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} className="gap-1.5 rounded-xl">
                <ArrowLeft className="h-3.5 w-3.5" /> Tilbake
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={saving || sending}
                  className="gap-1.5 rounded-xl"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Lagre utkast
                </Button>
                <Button
                  onClick={handleSendToCustomer}
                  disabled={saving || sending || !custEmail.trim()}
                  className="gap-1.5 rounded-xl"
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send til kunde
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
