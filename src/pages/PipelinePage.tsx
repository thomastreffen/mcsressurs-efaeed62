import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/lead-status";
import { LEAD_STATUS_CONFIG, type LeadStatus } from "@/lib/lead-status";
import { Loader2, Building2, DollarSign } from "lucide-react";
import { toast } from "sonner";

interface PipelineCard {
  id: string;
  type: "lead" | "calculation" | "offer";
  title: string;
  subtitle: string;
  value: number;
  stage: PipelineStage;
  sourceId: string;
}

export default function PipelinePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cards, setCards] = useState<PipelineCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [leadsRes, calcsRes, offersRes] = await Promise.all([
        supabase.from("leads").select("*").not("status", "eq", "lost"),
        supabase.from("calculations").select("*").not("status", "in", '("converted")'),
        supabase.from("offers").select("*, calculations(customer_name, project_title)").not("status", "in", '("expired")'),
      ]);

      const items: PipelineCard[] = [];

      // Leads → new/qualified
      for (const lead of (leadsRes.data || []) as any[]) {
        if (lead.status === "won") continue; // handled by offers
        const stage: PipelineStage = lead.status === "new" ? "new"
          : lead.status === "contacted" ? "new"
          : "qualified";
        items.push({
          id: `lead-${lead.id}`, type: "lead", title: lead.company_name,
          subtitle: lead.contact_name || lead.email || "", value: Number(lead.estimated_value) || 0,
          stage, sourceId: lead.id,
        });
      }

      // Calculations without offers → calculation
      const calcIdsWithOffers = new Set((offersRes.data || []).map((o: any) => o.calculation_id));
      for (const calc of (calcsRes.data || []) as any[]) {
        if (calcIdsWithOffers.has(calc.id)) continue;
        if (calc.status === "draft" || calc.status === "generated") {
          items.push({
            id: `calc-${calc.id}`, type: "calculation", title: calc.project_title,
            subtitle: calc.customer_name, value: Number(calc.total_price) || 0,
            stage: "calculation", sourceId: calc.id,
          });
        }
      }

      // Offers → offer_sent / negotiation / won
      for (const offer of (offersRes.data || []) as any[]) {
        const stage: PipelineStage = offer.status === "draft" ? "offer_sent"
          : offer.status === "sent" ? "offer_sent"
          : offer.status === "accepted" ? "won"
          : offer.status === "rejected" ? "lost"
          : "negotiation";
        items.push({
          id: `offer-${offer.id}`, type: "offer",
          title: offer.calculations?.project_title || offer.offer_number,
          subtitle: offer.calculations?.customer_name || "",
          value: Number(offer.total_inc_vat) || 0,
          stage, sourceId: offer.id,
        });
      }

      setCards(items);
      setLoading(false);
    })();
  }, []);

  const handleDragStart = (cardId: string) => setDragging(cardId);
  const handleDragEnd = () => setDragging(null);

  const handleDrop = async (targetStage: PipelineStage) => {
    if (!dragging) return;
    const card = cards.find((c) => c.id === dragging);
    if (!card || card.stage === targetStage) { setDragging(null); return; }

    // Only allow lead status changes via drag
    if (card.type === "lead") {
      const statusMap: Partial<Record<PipelineStage, LeadStatus>> = {
        new: "new", qualified: "qualified", won: "won", lost: "lost",
      };
      const newStatus = statusMap[targetStage];
      if (newStatus) {
        await supabase.from("leads").update({ status: newStatus }).eq("id", card.sourceId);
        await supabase.from("activity_log").insert({
          entity_type: "lead", entity_id: card.sourceId, action: "status_changed",
          description: `Pipeline: ${LEAD_STATUS_CONFIG[newStatus].label}`, performed_by: user?.id,
        });
        setCards((prev) => prev.map((c) => c.id === dragging ? { ...c, stage: targetStage } : c));
        toast.success("Lead flyttet");
      }
    }
    setDragging(null);
  };

  const handleCardClick = (card: PipelineCard) => {
    if (card.type === "calculation") navigate(`/calculations/${card.sourceId}`);
    else if (card.type === "offer") {
      // navigate to the calculation that owns this offer
      const offerCard = cards.find((c) => c.id === card.id);
      if (offerCard) navigate(`/sales/offers`);
    }
    // leads don't have a detail page yet
  };

  const stageCards = (stage: PipelineStage) => cards.filter((c) => c.stage === stage);
  const stageValue = (stage: PipelineStage) => stageCards(stage).reduce((s, c) => s + c.value, 0);

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Salgspipeline</h1>
        <p className="text-sm text-muted-foreground">
          {cards.length} aktive muligheter · kr {cards.reduce((s, c) => s + c.value, 0).toLocaleString("nb-NO")} total verdi
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "70vh" }}>
        {PIPELINE_STAGES.map((stage) => (
          <div
            key={stage.key}
            className={`flex-shrink-0 w-[260px] rounded-lg border bg-card flex flex-col ${dragging ? "ring-1 ring-primary/20" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(stage.key)}
          >
            <div className="p-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="text-sm font-medium">{stage.label}</span>
                <Badge variant="outline" className="text-[10px] h-5">{stageCards(stage.key).length}</Badge>
              </div>
              {stageValue(stage.key) > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  kr {stageValue(stage.key).toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
                </span>
              )}
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
              {stageCards(stage.key).map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={() => handleDragStart(card.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleCardClick(card)}
                  className={`rounded-md border bg-background p-3 cursor-pointer hover:shadow-sm transition-shadow ${dragging === card.id ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{card.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{card.subtitle}</p>
                    </div>
                    <Badge variant="outline" className="text-[9px] shrink-0">
                      {card.type === "lead" ? "Lead" : card.type === "calculation" ? "Kalkyle" : "Tilbud"}
                    </Badge>
                  </div>
                  {card.value > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <DollarSign className="h-3 w-3" />
                      kr {card.value.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
                    </div>
                  )}
                </div>
              ))}
              {stageCards(stage.key).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4 opacity-60">Ingen elementer</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
