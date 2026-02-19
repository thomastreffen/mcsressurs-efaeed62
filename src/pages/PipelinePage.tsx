import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/lead-status";
import { LEAD_STATUS_CONFIG, type LeadStatus } from "@/lib/lead-status";
import { Loader2, DollarSign, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface PipelineCard {
  id: string;
  type: "lead" | "calculation" | "offer";
  title: string;
  subtitle: string;
  value: number;
  probability: number;
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

      for (const lead of (leadsRes.data || []) as any[]) {
        if (lead.status === "won") continue;
        const stage: PipelineStage = lead.status === "new" ? "new"
          : lead.status === "contacted" ? "new"
          : "qualified";
        items.push({
          id: `lead-${lead.id}`, type: "lead", title: lead.company_name,
          subtitle: lead.contact_name || lead.email || "", value: Number(lead.estimated_value) || 0,
          probability: Number(lead.probability) || 50,
          stage, sourceId: lead.id,
        });
      }

      const calcIdsWithOffers = new Set((offersRes.data || []).map((o: any) => o.calculation_id));
      for (const calc of (calcsRes.data || []) as any[]) {
        if (calcIdsWithOffers.has(calc.id)) continue;
        if (calc.status === "draft" || calc.status === "generated") {
          items.push({
            id: `calc-${calc.id}`, type: "calculation", title: calc.project_title,
            subtitle: calc.customer_name, value: Number(calc.total_price) || 0,
            probability: 60,
            stage: "calculation", sourceId: calc.id,
          });
        }
      }

      for (const offer of (offersRes.data || []) as any[]) {
        const stage: PipelineStage = offer.status === "draft" ? "offer_sent"
          : offer.status === "sent" ? "offer_sent"
          : offer.status === "accepted" ? "won"
          : offer.status === "rejected" ? "lost"
          : "negotiation";
        const prob = stage === "won" ? 100 : stage === "lost" ? 0 : stage === "negotiation" ? 75 : 50;
        items.push({
          id: `offer-${offer.id}`, type: "offer",
          title: offer.calculations?.project_title || offer.offer_number,
          subtitle: offer.calculations?.customer_name || "",
          value: Number(offer.total_inc_vat) || 0,
          probability: prob,
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
    if (card.type === "lead") return;
    if (card.type === "calculation") navigate(`/sales/calculations/${card.sourceId}`);
    else navigate(`/sales/offers`);
  };

  const stageCards = (stage: PipelineStage) => cards.filter((c) => c.stage === stage);
  const stageValue = (stage: PipelineStage) => stageCards(stage).reduce((s, c) => s + c.value, 0);
  const stageWeightedValue = (stage: PipelineStage) => stageCards(stage).reduce((s, c) => s + c.value * (c.probability / 100), 0);

  const totalPipeline = cards.reduce((s, c) => s + c.value, 0);
  const totalWeighted = cards.reduce((s, c) => s + c.value * (c.probability / 100), 0);

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Salgspipeline</h1>
          <p className="text-sm text-muted-foreground">
            {cards.length} aktive muligheter
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="rounded-lg border bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground">Total pipeline</p>
            <p className="font-bold font-mono">kr {totalPipeline.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Forventet</p>
            <p className="font-bold font-mono text-primary">kr {totalWeighted.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "70vh" }}>
        {PIPELINE_STAGES.map((stage) => (
          <div
            key={stage.key}
            className={`flex-shrink-0 w-[260px] rounded-lg border bg-card flex flex-col ${dragging ? "ring-1 ring-primary/20" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(stage.key)}
          >
            <div className="p-3 border-b space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-medium">{stage.label}</span>
                  <Badge variant="outline" className="text-[10px] h-5">{stageCards(stage.key).length}</Badge>
                </div>
              </div>
              {stageValue(stage.key) > 0 && (
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                  <span>kr {stageValue(stage.key).toLocaleString("nb-NO", { maximumFractionDigits: 0 })}</span>
                  <span className="text-primary">≈ kr {stageWeightedValue(stage.key).toLocaleString("nb-NO", { maximumFractionDigits: 0 })}</span>
                </div>
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
                  className={`rounded-md border bg-background p-3 cursor-pointer hover:shadow-md hover:border-primary/20 transition-all ${dragging === card.id ? "opacity-50" : ""}`}
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
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        kr {card.value.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
                      </span>
                      <span className="text-[10px] font-mono">{card.probability}%</span>
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
