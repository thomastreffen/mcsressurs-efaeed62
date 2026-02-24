import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveLeads } from "@/lib/lead-queries";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { PIPELINE_STAGES, LEAD_STATUS_CONFIG, type PipelineStage, type LeadStatus } from "@/lib/lead-status";
import { Loader2 } from "lucide-react";
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
      const { data: leads } = await fetchActiveLeads();
      const activeLeads = (leads || []).filter((l: any) => l.status !== "lost");

      const leadIds = activeLeads.map((l: any) => l.id);

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

      const activityMap = new Map<string, string>();
      for (const a of (activityRes.data || []) as any[]) {
        if (!activityMap.has(a.entity_id)) activityMap.set(a.entity_id, a.created_at);
      }

      const items: PipelineCard[] = activeLeads.map((lead: any) => ({
        id: lead.id, leadId: lead.id,
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

  const activeStages = PIPELINE_STAGES.filter(s => s.key !== "won" && s.key !== "lost");
  const stageCards = (stage: PipelineStage) => cards.filter((c) => c.stage === stage);

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Salgspipeline</h1>
          <p className="text-xs text-muted-foreground">{cards.length} aktive leads</p>
        </div>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-4" style={{ minHeight: "70vh" }}>
        {activeStages.map((stage) => {
          const sc = stageCards(stage.key);
          return (
            <div
              key={stage.key}
              className={`flex-shrink-0 w-[250px] bg-secondary/20 rounded-lg flex flex-col ${dragging ? "ring-1 ring-primary/10" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stage.key)}
            >
              <div className="px-3 py-2.5 border-b border-border/10 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                <span className="text-xs font-medium text-foreground">{stage.label}</span>
                <span className="text-[10px] text-muted-foreground/60 font-mono ml-auto">{sc.length}</span>
              </div>

              <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto">
                {sc.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={() => handleDragStart(card.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => navigate(`/sales/leads/${card.leadId}`)}
                    className={`bg-card rounded-md border border-border/40 p-2.5 cursor-pointer hover:shadow-md hover:border-border/70 transition-all ${dragging === card.id ? "opacity-50" : ""}`}
                    style={{ borderLeft: `3px solid ${stage.color}` }}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate leading-tight">{card.title}</p>
                        {card.refCode && <p className="text-[9px] text-muted-foreground/50 font-mono mt-0.5">{card.refCode}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {card.hasCalc && <Badge variant="outline" className="text-[8px] h-4 px-1">Kalkyle</Badge>}
                        {card.hasOffer && <Badge variant="outline" className="text-[8px] h-4 px-1">Tilbud</Badge>}
                      </div>
                    </div>
                    {card.value > 0 && (
                      <p className="mt-1.5 text-xs text-muted-foreground font-mono">
                        kr {card.value.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
                        <span className="text-muted-foreground/50 ml-1">({card.probability}%)</span>
                      </p>
                    )}
                    {card.lastActivity && (
                      <p className="mt-1 text-[10px] text-muted-foreground/50">
                        {formatDistanceToNow(new Date(card.lastActivity), { addSuffix: true, locale: nb })}
                      </p>
                    )}
                  </div>
                ))}
                {sc.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/50 text-center py-6">Ingen leads</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
