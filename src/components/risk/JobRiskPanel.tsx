import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getRiskFlagLabel } from "@/lib/risk-flag-labels";
import { getCategoryForFlag, CATEGORY_LABELS, type RiskCategory } from "@/lib/risk-categories";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContractJobSection } from "@/components/contracts/ContractJobSection";
import { RegulationJobSection } from "@/components/regulation/RegulationJobSection";
import {
  ShieldCheck,
  ShieldQuestion,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Check,
  EyeOff,
  Plus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

interface RiskItem {
  id: string;
  job_id: string;
  source_type: string;
  label: string;
  category: string;
  severity: string;
  status: string;
}

interface JobRiskPanelProps {
  jobId: string;
  companyId?: string;
}

function riskLevel(openCount: number): { label: string; color: string; icon: typeof ShieldCheck } {
  if (openCount >= 7) return { label: "Høy risiko", color: "bg-destructive/10 text-destructive border-destructive/20", icon: ShieldAlert };
  if (openCount >= 3) return { label: "Middels risiko", color: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800", icon: ShieldQuestion };
  return { label: "Lav risiko", color: "bg-success/10 text-success border-success/20", icon: ShieldCheck };
}

export function JobRiskPanel({ jobId, companyId }: JobRiskPanelProps) {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from("job_risk_items")
      .select("*")
      .eq("job_id", jobId)
      .order("category")
      .order("severity", { ascending: false });
    if (data) setItems(data as RiskItem[]);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  /* Aggregate risks from document_analyses + change_orders → upsert into job_risk_items */
  const syncRisks = useCallback(async () => {
    setSyncing(true);
    try {
      // 1. Fetch all risk_flags from document analyses for this job
      const { data: analyses } = await supabase
        .from("document_analyses")
        .select("parsed_fields, analysis_type")
        .eq("job_id", jobId);

      const flagSet = new Map<string, { source: string; category: RiskCategory }>();

      for (const a of analyses || []) {
        const pf = (a.parsed_fields as any) || {};
        const flags: string[] = pf.risk_flags || [];
        for (const f of flags) {
          if (!flagSet.has(f)) {
            flagSet.set(f, {
              source: a.analysis_type === "offer" ? "offer" : "contract",
              category: getCategoryForFlag(f),
            });
          }
        }
      }

      // 2. Fetch change orders with schedule impact
      const { data: cos } = await supabase
        .from("job_change_orders")
        .select("id, title, schedule_impact, amount_ex_vat")
        .eq("job_id", jobId)
        .not("schedule_impact", "is", null);

      for (const co of cos || []) {
        const key = `co_${co.id}`;
        if (!flagSet.has(key)) {
          flagSet.set(key, { source: "change_order", category: "schedule" });
        }
      }

      // 3. Upsert into job_risk_items (only new ones, don't overwrite status)
      const existing = new Set(items.map(i => i.label));
      const toInsert: Array<{
        job_id: string;
        label: string;
        source_type: string;
        category: string;
        severity: string;
        status: string;
      }> = [];

      for (const [key, val] of flagSet) {
        const label = key.startsWith("co_")
          ? `Tillegg med fremdriftskonsekvens: ${(cos || []).find(c => `co_${c.id}` === key)?.title || key}`
          : getRiskFlagLabel(key);
        if (!existing.has(label)) {
          toInsert.push({
            job_id: jobId,
            label,
            source_type: val.source,
            category: val.category,
            severity: "medium",
            status: "open",
          });
        }
      }

      if (toInsert.length > 0) {
        const { error } = await supabase
          .from("job_risk_items")
          .upsert(toInsert, { onConflict: "job_id,label" });
        if (error) throw error;
      }

      toast.success(`${toInsert.length} nye risikoer lagt til`);
      await fetchItems();
    } catch (e: any) {
      toast.error("Kunne ikke synkronisere risikoer", { description: e.message });
    }
    setSyncing(false);
  }, [jobId, items, fetchItems]);

  const updateStatus = async (itemId: string, newStatus: string) => {
    await supabase.from("job_risk_items").update({ status: newStatus }).eq("id", itemId);
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: newStatus } : i));
  };

  const openItems = items.filter(i => i.status === "open" || i.status === "acknowledged");
  const resolvedItems = items.filter(i => i.status === "resolved" || i.status === "ignored");
  const level = riskLevel(openItems.length);
  const LevelIcon = level.icon;

  // Group by category
  const grouped: Record<string, RiskItem[]> = {};
  for (const item of openItems) {
    const cat = item.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const toggleCat = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Auto-expand all on first load
  useEffect(() => {
    if (!loading && openItems.length > 0) {
      setExpandedCats(new Set(Object.keys(grouped)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header: Risk level badge + sync button ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${level.color}`}>
            <LevelIcon className="h-3.5 w-3.5" />
            {level.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {openItems.length} åpne {openItems.length === 1 ? "risiko" : "risikoer"}
          </span>
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5 text-xs"
            disabled={syncing}
            onClick={syncRisks}
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Oppdater risikoer
          </Button>
        )}
      </div>

      {/* ── Categorized risk items ── */}
      {Object.keys(grouped).length === 0 && (
        <div className="text-center py-6">
          <ShieldCheck className="h-8 w-8 text-success/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Ingen åpne risikoer registrert.</p>
          {isAdmin && (
            <p className="text-xs text-muted-foreground mt-1">
              Trykk «Oppdater risikoer» for å hente fra analyser.
            </p>
          )}
        </div>
      )}

      {Object.entries(grouped).map(([cat, catItems]) => {
        const catLabel = CATEGORY_LABELS[cat as RiskCategory] || cat;
        const expanded = expandedCats.has(cat);
        return (
          <div key={cat} className="rounded-xl border border-border/60 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
              onClick={() => toggleCat(cat)}
            >
              <span className="text-sm font-medium flex items-center gap-2">
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {catLabel}
                <Badge variant="outline" className="text-[10px] h-5 ml-1">{catItems.length}</Badge>
              </span>
            </button>
            {expanded && (
              <div className="divide-y divide-border/40">
                {catItems.map(item => (
                  <div key={item.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{item.label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[9px] h-4">
                          {item.source_type === "offer" ? "Tilbud" : item.source_type === "contract" ? "Kontrakt" : item.source_type === "change_order" ? "Tillegg" : "Manuell"}
                        </Badge>
                        {item.status === "acknowledged" && (
                          <Badge variant="secondary" className="text-[9px] h-4">Tatt til etterretning</Badge>
                        )}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg"
                          title="Marker som avklart"
                          onClick={() => updateStatus(item.id, "resolved")}
                        >
                          <Check className="h-3.5 w-3.5 text-success" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg"
                          title="Ignorer"
                          onClick={() => updateStatus(item.id, "ignored")}
                        >
                          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Resolved/ignored items (collapsed summary) ── */}
      {resolvedItems.length > 0 && (
        <p className="text-xs text-muted-foreground pl-1">
          {resolvedItems.length} {resolvedItems.length === 1 ? "risiko" : "risikoer"} avklart eller ignorert
        </p>
      )}

      {/* ── Existing sections below ── */}
      <div className="border-t border-border/40 pt-6 space-y-6">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            Kontraktstatus
          </h3>
          <ContractJobSection jobId={jobId} />
        </div>
        <div>
          <RegulationJobSection jobId={jobId} companyId={companyId} />
        </div>
      </div>
    </div>
  );
}
