import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getRiskFlagLabel } from "@/lib/risk-flag-labels";
import {
  getCategoryForFlag,
  getSeverityForFlag,
  isComplianceFlag,
  isComplianceText,
  CATEGORY_LABELS,
  type RiskCategory,
} from "@/lib/risk-categories";
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
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  FileCheck,
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
  raw_key?: string;
}

interface JobRiskPanelProps {
  jobId: string;
  companyId?: string;
}

/* ── Weighted risk level ── */
function computeRiskScore(openItems: RiskItem[]): number {
  let score = 0;
  for (const item of openItems) {
    if (item.severity === "high") score += 2;
    else if (item.severity === "medium") score += 1;
    // low = 0
  }
  return score;
}

function riskLevel(score: number): { label: string; color: string; icon: typeof ShieldCheck } {
  if (score >= 9)
    return { label: "Høy risiko", color: "bg-destructive/10 text-destructive border-destructive/20", icon: ShieldAlert };
  if (score >= 4)
    return {
      label: "Middels risiko",
      color: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
      icon: ShieldQuestion,
    };
  return { label: "Lav risiko", color: "bg-success/10 text-success border-success/20", icon: ShieldCheck };
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_LABELS: Record<string, string> = { high: "Høy", medium: "Middels", low: "Lav" };
const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-700",
  low: "bg-muted text-muted-foreground border-border",
};

/* ── Render a single risk row ── */
function RiskRow({ item, isAdmin, onResolve, onIgnore }: {
  item: RiskItem;
  isAdmin: boolean;
  onResolve: () => void;
  onIgnore: () => void;
}) {
  return (
    <div className="px-4 py-3 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{item.label}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {import.meta.env.DEV && item.raw_key && (
            <Badge variant="outline" className="text-[8px] h-4 font-mono bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800">
              Flag: {item.raw_key}
            </Badge>
          )}
          <Badge variant="outline" className="text-[9px] h-4">
            {item.source_type === "offer" ? "Tilbud" : item.source_type === "contract" ? "Kontrakt" : item.source_type === "change_order" ? "Tillegg" : "Manuell"}
          </Badge>
          <Badge variant="outline" className={`text-[9px] h-4 ${SEVERITY_COLORS[item.severity] || ""}`}>
            {SEVERITY_LABELS[item.severity] || item.severity}
          </Badge>
          {item.status === "acknowledged" && (
            <Badge variant="secondary" className="text-[9px] h-4">Tatt til etterretning</Badge>
          )}
        </div>
      </div>
      {isAdmin && (
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="Marker som avklart" onClick={onResolve}>
            <Check className="h-3.5 w-3.5 text-success" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="Ignorer" onClick={onIgnore}>
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function JobRiskPanel({ jobId, companyId }: JobRiskPanelProps) {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [lastSyncTs, setLastSyncTs] = useState<string | null>(null);

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

  /* ── Sync risks from analyses + change orders ── */
  const syncRisks = useCallback(async () => {
    setSyncing(true);
    try {
      const { data: analyses } = await supabase
        .from("document_analyses")
        .select("parsed_fields, analysis_type")
        .eq("job_id", jobId);

      const flagSet = new Map<string, { source: string; category: RiskCategory; severity: string; rawKey: string }>();
      const allRawKeys: string[] = [];

      for (const a of analyses || []) {
        const pf = (a.parsed_fields as any) || {};
        const flags: string[] = pf.risk_flags || [];
        for (const f of flags) {
          allRawKeys.push(f);
          if (!flagSet.has(f)) {
            // isComplianceText detects Norwegian sentence-keys and forces LOW + documentation
            const severity = getSeverityForFlag(f);
            const category = getCategoryForFlag(f);
            flagSet.set(f, {
              source: a.analysis_type === "offer" ? "offer" : "contract",
              category,
              severity,
              rawKey: f,
            });
          }
        }
      }

      if (import.meta.env.DEV) {
        const unique = [...new Set(allRawKeys)].sort();
        console.group("[RiskSync] Unike risk_flag keys for job", jobId);
        console.table(unique.map(k => ({ key: k, severity: getSeverityForFlag(k), category: getCategoryForFlag(k) })));
        console.groupEnd();
      }

      const { data: cos } = await supabase
        .from("job_change_orders")
        .select("id, title, schedule_impact, amount_ex_vat")
        .eq("job_id", jobId)
        .not("schedule_impact", "is", null);

      for (const co of cos || []) {
        const key = `co_${co.id}`;
        if (!flagSet.has(key)) {
          flagSet.set(key, { source: "change_order", category: "schedule", severity: "medium", rawKey: key });
        }
      }

      const existing = new Set(items.map(i => i.label));
      const toInsert: Array<{
        job_id: string; label: string; source_type: string;
        category: string; severity: string; status: string;
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
            severity: val.severity,
            status: "open",
          });
        }
        // Store raw key for dev display
        if (import.meta.env.DEV && !key.startsWith("co_")) {
          const existingItem = items.find(i => i.label === label);
          if (existingItem) existingItem.raw_key = key;
        }
      }

      if (toInsert.length > 0) {
        const { error } = await supabase
          .from("job_risk_items")
          .upsert(toInsert, { onConflict: "job_id,label" });
        if (error) throw error;
      }

      if (import.meta.env.DEV) {
        const allSynced = [...flagSet.entries()].map(([key, val]) => ({ key, category: val.category, severity: val.severity }));
        console.warn("[RiskSync] SYNC DONE", { count: allSynced.length });
        console.table(allSynced);
      }

      toast.success(`${toInsert.length} nye risikoer lagt til`);
      setLastSyncTs(new Date().toLocaleTimeString());
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

  /* ── Derived data ── */
  const openItems = items.filter(i => i.status === "open" || i.status === "acknowledged");
  const resolvedItems = items.filter(i => i.status === "resolved" || i.status === "ignored");

  // Separate compliance (low/general) from project-critical
  const complianceItems = openItems.filter(i => i.severity === "low" || i.category === "documentation");
  const projectItems = openItems.filter(i => i.severity !== "low" && i.category !== "documentation");

  // Score excludes compliance items
  const score = computeRiskScore(projectItems);
  const level = riskLevel(score);
  const LevelIcon = level.icon;

  // Top 5 critical risks: HIGH, or MEDIUM non-documentation
  const CATEGORY_PRIORITY: Record<string, number> = {
    economic: 0, technical: 1, schedule: 2, legal: 3, documentation: 4,
  };
  const topCritical = [...projectItems]
    .filter(i =>
      i.severity === "high" ||
      (i.severity === "medium" && i.category !== "documentation")
    )
    .sort((a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 1) - (SEVERITY_ORDER[b.severity] ?? 1) ||
      (CATEGORY_PRIORITY[a.category] ?? 4) - (CATEGORY_PRIORITY[b.category] ?? 4)
    )
    .slice(0, 5);

  // Group project items by category (excluding compliance)
  const grouped: Record<string, RiskItem[]> = {};
  for (const item of projectItems) {
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
      const cats = new Set(Object.keys(grouped));
      if (complianceItems.length > 0) cats.add("__compliance");
      setExpandedCats(cats);
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
      {/* ── DEV badge ── */}
      {import.meta.env.DEV && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-violet-500">
          <Badge variant="outline" className="h-4 text-[9px] bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800">DEV</Badge>
          <span>Last sync: {lastSyncTs ?? "–"}</span>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${level.color}`}>
            <LevelIcon className="h-3.5 w-3.5" />
            {level.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {openItems.length} åpne · {score} poeng
          </span>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs" disabled={syncing} onClick={() => {
            if (import.meta.env.DEV) console.warn("[RiskSync] BUTTON CLICK", { jobId, ts: Date.now() });
            syncRisks();
          }}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Oppdater risikoer
          </Button>
        )}
      </div>

      {/* ── Empty state ── */}
      {openItems.length === 0 && (
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

      {/* ── Top critical risks ── */}
      {topCritical.length > 0 && (
        <div className="rounded-xl border border-destructive/30 overflow-hidden">
          <div className="px-4 py-2.5 bg-destructive/5 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-destructive">Topp prosjektkritiske risikoer (økonomi / teknikk / fremdrift)</span>
            <Badge variant="outline" className="text-[10px] h-5 ml-1 border-destructive/30 text-destructive">{topCritical.length}</Badge>
          </div>
          <div className="divide-y divide-border/40">
            {topCritical.map(item => (
              <RiskRow
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                onResolve={() => updateStatus(item.id, "resolved")}
                onIgnore={() => updateStatus(item.id, "ignored")}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Categorized project risk items ── */}
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
                  <RiskRow
                    key={item.id}
                    item={item}
                    isAdmin={isAdmin}
                    onResolve={() => updateStatus(item.id, "resolved")}
                    onIgnore={() => updateStatus(item.id, "ignored")}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Compliance / general contract requirements ── */}
      {complianceItems.length > 0 && (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
            onClick={() => toggleCat("__compliance")}
          >
            <span className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              {expandedCats.has("__compliance") ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <FileCheck className="h-3.5 w-3.5" />
              Generelle kontraktskrav
              <Badge variant="outline" className="text-[10px] h-5 ml-1">{complianceItems.length}</Badge>
            </span>
          </button>
          {expandedCats.has("__compliance") && (
            <div className="divide-y divide-border/40">
              {complianceItems.map(item => (
                <RiskRow
                  key={item.id}
                  item={item}
                  isAdmin={isAdmin}
                  onResolve={() => updateStatus(item.id, "resolved")}
                  onIgnore={() => updateStatus(item.id, "ignored")}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Resolved summary ── */}
      {resolvedItems.length > 0 && (
        <p className="text-xs text-muted-foreground pl-1">
          {resolvedItems.length} {resolvedItems.length === 1 ? "risiko" : "risikoer"} avklart eller ignorert
        </p>
      )}

      {/* ── Existing sections ── */}
      <div className="border-t border-border/40 pt-6 space-y-6">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">Kontraktstatus</h3>
          <ContractJobSection jobId={jobId} />
        </div>
        <div>
          <RegulationJobSection jobId={jobId} companyId={companyId} />
        </div>
      </div>
    </div>
  );
}
