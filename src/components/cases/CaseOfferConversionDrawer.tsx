import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import {
  Sparkles, User, Mail, FileText, AlertTriangle, Loader2, Trash2, Check,
} from "lucide-react";

type CaseItem = {
  id: string;
  case_id: string;
  type: string;
  subject: string | null;
  from_email: string | null;
  body_preview: string | null;
  body_html: string | null;
  received_at: string | null;
  created_at: string;
};

interface AiDraft {
  customer_name: string;
  contact_name: string;
  contact_email: string;
  summary: string;
  recommended_next_step: string;
  pricing_structure: {
    materials: string;
    labor: string;
    reservations: string;
  };
}

interface CaseOfferConversionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  caseTitle: string;
  companyId: string;
  items: CaseItem[];
  currentUserId: string;
  onConverted: (offerId: string) => void;
}

export function CaseOfferConversionDrawer({
  open, onOpenChange, caseId, caseTitle, companyId, items, currentUserId, onConverted,
}: CaseOfferConversionDrawerProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // AI draft fields (editable)
  const [customerName, setCustomerName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [summary, setSummary] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [materials, setMaterials] = useState("");
  const [labor, setLabor] = useState("");
  const [reservations, setReservations] = useState("");
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);

  const latestEmail = [...items].filter(i => i.type === "email").sort((a, b) =>
    new Date(b.received_at || b.created_at).getTime() - new Date(a.received_at || a.created_at).getTime()
  )[0];

  useEffect(() => {
    if (!open) return;
    // Pre-fill from email data
    if (latestEmail) {
      setContactEmail(latestEmail.from_email || "");
      setSummary(latestEmail.body_preview || "");
    }
    setCustomerName("");
    setContactName("");
    setNextStep("");
    setMaterials("");
    setLabor("");
    setReservations("");
    setAiConfidence(null);
  }, [open]);

  const runAiDraft = async () => {
    setAiLoading(true);
    try {
      const emailBodies = items
        .filter(i => i.type === "email")
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map(i => `Fra: ${i.from_email || "ukjent"}\nEmne: ${i.subject || ""}\n${i.body_preview || ""}`)
        .join("\n---\n");

      const { data, error } = await supabase.functions.invoke("case-offer-ai-draft", {
        body: { caseTitle, emailBodies, companyId },
      });
      if (error) throw error;
      if (data) {
        const d = data as AiDraft & { confidence?: number };
        setCustomerName(d.customer_name || "");
        setContactName(d.contact_name || "");
        setContactEmail(d.contact_email || contactEmail);
        setSummary(d.summary || summary);
        setNextStep(d.recommended_next_step || "");
        setMaterials(d.pricing_structure?.materials || "");
        setLabor(d.pricing_structure?.labor || "");
        setReservations(d.pricing_structure?.reservations || "");
        setAiConfidence(d.confidence ?? null);
        toast.success("AI-utkast generert");
      }
    } catch (err: any) {
      console.error("AI draft error:", err);
      toast.error("Kunne ikke generere AI-utkast: " + (err.message || "Ukjent feil"));
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!customerName.trim()) {
      toast.error("Kundenavn er påkrevd");
      return;
    }
    setCreating(true);
    try {
      // 1) Create calculation
      const { data: calc, error: calcErr } = await supabase.from("calculations").insert({
        project_title: caseTitle,
        customer_name: customerName,
        customer_email: contactEmail || null,
        description: summary || null,
        created_by: currentUserId,
        company_id: companyId,
        source_case_id: caseId,
        source_case_item_id: latestEmail?.id || null,
        status: "draft",
      } as any).select("id").single();
      if (calcErr) throw calcErr;

      // 2) Add AI-suggested items if any
      const calcItems: any[] = [];
      if (materials.trim()) {
        calcItems.push({
          calculation_id: calc.id,
          title: "Materiell (AI-forslag)",
          description: materials,
          type: "material",
          quantity: 1,
          unit_price: 0,
          total_price: 0,
          suggested_by_ai: true,
        });
      }
      if (labor.trim()) {
        calcItems.push({
          calculation_id: calc.id,
          title: "Arbeid (AI-forslag)",
          description: labor,
          type: "labor",
          quantity: 1,
          unit_price: 0,
          total_price: 0,
          suggested_by_ai: true,
        });
      }
      if (calcItems.length > 0) {
        await supabase.from("calculation_items").insert(calcItems as any);
      }

      // 3) Log conversion in case_items
      await supabase.from("case_items").insert({
        case_id: caseId,
        company_id: companyId,
        type: "system",
        subject: "Tilbud opprettet",
        body_preview: `Tilbud opprettet for ${customerName}. Kalkyle: ${calc.id}`,
        created_by: currentUserId,
      } as any);

      // 4) Update case status
      await supabase.from("cases").update({
        status: "converted",
        offer_id: calc.id, // link to calculation (which is the offer container)
      } as any).eq("id", caseId);

      toast.success("Tilbud opprettet!");
      onConverted(calc.id);
      onOpenChange(false);
      navigate(`/sales/offers/${calc.id}`);
    } catch (err: any) {
      console.error("Create offer error:", err);
      toast.error("Feil ved opprettelse: " + (err.message || "Ukjent feil"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Opprett tilbud fra henvendelse
          </DrawerTitle>
          <DrawerDescription>
            Konverter «{caseTitle}» til et tilbud. Bruk AI for å foreslå detaljer.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* AI assist button */}
          <div className="flex items-center gap-2">
            <Button onClick={runAiDraft} disabled={aiLoading} variant="secondary" size="sm" className="gap-1.5">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {aiLoading ? "Analyserer…" : "Kjør AI-utkast"}
            </Button>
            {aiConfidence !== null && (
              <Badge variant="secondary" className="text-xs">
                AI-konfidens: {Math.round(aiConfidence * 100)}%
              </Badge>
            )}
          </div>

          <Separator />

          {/* Editable fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Kundenavn *</label>
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Firma AS" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Kontaktperson</label>
              <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Ola Nordmann" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">E-post</label>
              <Input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="ola@firma.no" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Anbefalt neste steg</label>
              <Input value={nextStep} onChange={e => setNextStep(e.target.value)} placeholder="Befaring, oppfølging…" className="mt-1" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Sammendrag</label>
            <Textarea value={summary} onChange={e => setSummary(e.target.value)} placeholder="Beskrivelse av forespørselen…" className="mt-1" rows={3} />
          </div>

          <Separator />

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prisstruktur (AI-forslag)</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Materiell</label>
              <Textarea value={materials} onChange={e => setMaterials(e.target.value)} placeholder="Beskrivelse av materiell…" className="mt-1" rows={2} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Arbeid</label>
              <Textarea value={labor} onChange={e => setLabor(e.target.value)} placeholder="Beskrivelse av arbeid…" className="mt-1" rows={2} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Forbehold</label>
              <Textarea value={reservations} onChange={e => setReservations(e.target.value)} placeholder="Eventuelle forbehold…" className="mt-1" rows={2} />
            </div>
          </div>
        </div>

        <DrawerFooter className="flex-row gap-2">
          <DrawerClose asChild>
            <Button variant="outline" className="flex-1">Avbryt</Button>
          </DrawerClose>
          <Button onClick={handleCreate} disabled={creating || !customerName.trim()} className="flex-1 gap-1.5">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Opprett tilbud
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
