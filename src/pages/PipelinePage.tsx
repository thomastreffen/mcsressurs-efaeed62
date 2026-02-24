import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { PIPELINE_STAGES, LEAD_STATUS_CONFIG, type PipelineStage, type LeadStatus } from "@/lib/lead-status";
import { Loader2, DollarSign, TrendingUp, Clock } from "lucide-react";
import { toast } from "sonner";

interface PipelineCard {
  id: string;
  leadId: string;
  title: string;
  subtitle: string;
  value: number;
  probability: number;
  stage: PipelineStage;
  lastActivity: string | null;
  hasCalc: boolean;
  hasOffer: boolean;
  refCode: string | null;
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

      // Fetch all active leads as the single source of truth
      const { data: leads } = await supabase
        .from("leads")
        .select("*")
        .is("deleted_at", null)
        .not("status", "eq", "lost");

      const leadIds = (leads || []).map((l: any) => l.id);

      // Fetch linked calculations and offers for context badges
      const [calcsRes, offersRes, activityRes] = await Promise.all([
        leadIds.length > 0
          ? supabase.from("calculations").select("id, lead_id").in("lead_id", leadIds).is("deleted_at", null)
          : Promise.resolve({ data: [] }),
        leadIds.length > 0
          ? supabase.from("offers").select("id, lead_id").in("lead_id", leadIds).is("deleted_at", null)
          : Promise.resolve({ data: [] }),
        leadIds.length > 0
          ? supabase.from("activity_log").select("entity_id, created_at").eq("entity_type", "lead").in("entity_id", leadIds).order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);

      const calcLeadIds = new Set((calcsRes.data || []).map((c: any) => c.lead_id));
      const offerLeadIds = new Set((offersRes.data || []).map((o: any) => o.lead_id));

      // Build latest activity map (first occurrence per lead = most recent)
      const activityMap = new Map<string, string>();
      for (const a of (activityRes.data || []) as any[]) {
        if (!activityMap.has(a.entity_id)) {
          activityMap.set(a.entity_id, a.created_at);
        }
      }

      const items: PipelineCard[] = (leads || []).map((lead: any) => ({
        id: lead.id,
        leadId: lead.id,
        title: lead.company_name,
        subtitle: lead.contact_name || lead.email || "",
        value: Number(lead.estimated_value) || 0,
        probability: Number(lead.probability) || 50,
        stage: lead.status as PipelineStage,
        lastActivity: activityMap.get(lead.id) || lead.created_at,
        hasCalc: calcLeadIds.has(lead.id),
        hasOffer: offerLeadIds.has(lead.id),
        refCode: lead.lead_ref_code || null,
      }));

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

    await supabase.from("leads").update({ status: targetStage as LeadStatus }).eq("id", card.leadId);
    await supabase.from("activity_log").insert({
      entity_type: "lead", entity_id: card.leadId, action: "status_changed",
      description: `Pipeline: ${LEAD_STATUS_CONFIG[targetStage].label}`, performed_by: user?.id,
    });
    setCards((prev) => prev.map((c) => c.id === dragging ? { ...c, stage: targetStage } : c));
    toast.success(`Lead flyttet til ${LEAD_STATUS_CONFIG[targetStage].label}`);
    setDragging(null);
  };

  const handleCardClick = (card: PipelineCard) => {
    navigate(`/sales/leads/${card.leadId}`);
  };

  // Exclude won/lost from active pipeline view
  const activeStages = PIPELINE_STAGES.filter(s => s.key !== "won" && s.key !== "lost");
  const stageCards = (stage: PipelineStage) => cards.filter((c) => c.stage === stage);
  const stageValue = (stage: PipelineStage) => stageCards(stage).reduce((s, c) => s + c.value, 0);
  const stageWeightedValue = (stage: PipelineStage) => stageCards(stage).reduce((s, c) => s + c.value * (c.probability / 100), 0);

  const activeCards = cards.filter(c => c.stage !== "won" && c.stage !== "lost");
  const totalPipeline = activeCards.reduce((s, c) => s + c.value, 0);
  const totalWeighted = activeCards.reduce((s, c) => s + c.value * (c.probability / 100), 0);

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Salgspipeline</h1>
          <p className="text-sm text-muted-foreground">
            {activeCards.length} aktive leads
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
        {activeStages.map((stage) => (
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
                    <div className="flex gap-1 shrink-0">
                      {card.hasCalc && <Badge variant="outline" className="text-[9px]">Kalkyle</Badge>}
                      {card.hasOffer && <Badge variant="outline" className="text-[9px]">Tilbud</Badge>}
                    </div>
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
                  {card.lastActivity && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/70">
                      <Clock className="h-3 w-3" />
                      <span>{formatDistanceToNow(new Date(card.lastActivity), { addSuffix: true, locale: nb })}</span>
                    </div>
                  )}
                  {card.refCode && (
                    <p className="mt-1 text-[9px] text-muted-foreground/50 font-mono">{card.refCode}</p>
                  )}
                </div>
              ))}
              {stageCards(stage.key).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4 opacity-60">Ingen leads</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
