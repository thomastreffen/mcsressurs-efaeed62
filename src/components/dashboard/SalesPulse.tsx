import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveLeads } from "@/lib/lead-queries";
import { useIsMobile } from "@/hooks/use-mobile";
import { PIPELINE_STAGES, LEAD_STATUS_CONFIG, ALL_LEAD_STATUSES, type LeadStatus } from "@/lib/lead-status";
import { ArrowRight, TrendingUp, Target, Trophy, Zap, AlertCircle, Clock, FileText, Send, CheckCircle2, Lightbulb } from "lucide-react";

type StatusColor = "green" | "yellow" | "red";

interface SalesGauge {
  key: string;
  label: string;
  value: string;
  pct: number;
  status: StatusColor;
  subLabel: string;
  size: number;
  emphasis?: boolean;
  href: string;
  icon: React.ReactNode;
}

interface ActionItem {
  label: string;
  count: number;
  severity: "high" | "medium";
  href: string;
}

// ── Donut gauge ──
function DonutGauge({ pct, status, size = 190, emphasis = false }: { pct: number; status: StatusColor; size?: number; emphasis?: boolean }) {
  const strokeWidth = emphasis ? 14 : 11;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct / 100));
  const dashLen = clamped * circumference;

  const strokeColor = status === "green"
    ? emphasis ? "hsl(152, 55%, 40%)" : "hsl(152, 38%, 48%)"
    : status === "yellow"
      ? emphasis ? "hsl(38, 65%, 52%)" : "hsl(38, 50%, 56%)"
      : emphasis ? "hsl(0, 55%, 55%)" : "hsl(0, 40%, 60%)";

  const trackColor = pct <= 0 ? "hsl(152, 20%, 85%)" : "hsl(210, 8%, 91%)";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      {pct > 0 && (
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={`${dashLen} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-700 ease-out"
        />
      )}
    </svg>
  );
}

// ── Tempo message ──
function getTempoMessage(score: number, pipelinePct: number, winRate: number, momentumPct: number): { message: string; action: string; actionHref: string } {
  const parts: string[] = [];
  if (score >= 70) parts.push("God aktivitet");
  else if (score >= 50) parts.push("Jevn aktivitet");
  else parts.push("Lav aktivitet – prioriter oppfølging");

  if (pipelinePct >= 100) parts.push("Pipeline dekker mål");
  else if (pipelinePct >= 80) parts.push("Pipeline bygger seg");
  else parts.push("Pipeline trenger påfyll");

  let action = "Se inaktive leads";
  let actionHref = "/sales/leads?filter=inactive_7d";

  if (winRate < 20) { action = "Gjennomgå tilbudsstrategi"; actionHref = "/sales/offers?filter=sent_last_90d"; }
  else if (momentumPct < -10) { action = "Øk tilbudsfrekvensen"; actionHref = "/sales/offers?filter=sent_last_30d"; }
  else if (pipelinePct < 80) { action = "Bygg pipeline"; actionHref = "/sales/pipeline"; }
  else if (score < 50) { action = "Følg opp tilbud"; actionHref = "/sales/offers?filter=no_followup"; }

  return { message: parts.join(". ") + ".", action, actionHref };
}

const QUICK_FILTERS = [
  { label: "Inaktive >7d", href: "/sales/leads?filter=inactive_7d", icon: <Clock className="h-3 w-3" /> },
  { label: "Kalkyle uten tilbud", href: "/sales/calculations?filter=ready_no_offer", icon: <FileText className="h-3 w-3" /> },
  { label: "Tilbud uten oppfølging", href: "/sales/offers?filter=no_followup", icon: <Send className="h-3 w-3" /> },
  { label: "Denne uken", href: "/sales/leads?sort=activity_desc&range=7d", icon: <TrendingUp className="h-3 w-3" /> },
];

const OK_ROWS = [
  "Alle leads er fulgt opp",
  "Ingen ventende kalkyler",
  "Tilbud er under oppfølging",
];

// ── Gauge button ──
function GaugeButton({ g, nav, className = "" }: { g: SalesGauge; nav: (path: string) => void; className?: string }) {
  return (
    <button
      onClick={() => nav(g.href)}
      className={`flex flex-col items-center text-center group cursor-pointer rounded-xl px-1.5 py-1.5
                 hover:bg-background/70 hover:shadow-md active:scale-[0.98]
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
                 transition-all duration-150 ${className}`}
      aria-label={`${g.label} – ${g.value}`}
    >
      <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-widest mb-0.5
                       group-hover:text-foreground group-hover:underline underline-offset-2
                       transition-colors flex items-center gap-1">
        {g.icon} {g.label}
      </span>
      <div className="relative" style={{ width: g.size, height: g.size }}>
        <DonutGauge pct={g.pct} status={g.status} size={g.size} emphasis={g.emphasis} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className={`font-semibold text-foreground font-mono leading-none ${g.emphasis ? "text-3xl sm:text-4xl" : "text-lg sm:text-xl"}`}>
            {g.value}
          </p>
        </div>
      </div>
      <p className="text-[9px] text-muted-foreground/50 mt-0 max-w-[130px] leading-tight
                    group-hover:text-foreground/60 transition-colors">
        {g.subLabel}
      </p>
      <span className="text-[8px] text-primary/0 group-hover:text-primary/50 transition-colors flex items-center gap-0.5">
        Detaljer <ArrowRight className="h-2 w-2" />
      </span>
    </button>
  );
}

// ── Main ──
export function SalesPulse() {
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [gauges, setGauges] = useState<SalesGauge[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [statusCounts, setStatusCounts] = useState<{ key: LeadStatus; label: string; color: string; count: number }[]>([]);
  const [tempo, setTempo] = useState<{ message: string; action: string; actionHref: string }>({ message: "", action: "", actionHref: "" });

  useEffect(() => { fetchSalesData(); }, []);

  async function fetchSalesData() {
    setLoading(true);
    const now = new Date();
    const d14 = new Date(now.getTime() - 14 * 86400000).toISOString();
    const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();
    const d60 = new Date(now.getTime() - 60 * 86400000).toISOString();
    const d90 = new Date(now.getTime() - 90 * 86400000).toISOString();
    const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();

    const leadsRes = await fetchActiveLeads("id, status, estimated_value, probability, next_action_date, updated_at, created_at");
    const [offersRes, calcsRes] = await Promise.all([
      supabase.from("offers").select("id, status, created_at, total_inc_vat, lead_id").order("created_at", { ascending: false }),
      supabase.from("calculations").select("id, lead_id, status").is("deleted_at", null),
    ]);

    const leads = leadsRes.data;
    const offers = offersRes.data || [];
    const calcs = calcsRes.data || [];

    // Status counts
    const counts = ALL_LEAD_STATUSES
      .filter(s => s !== "won" && s !== "lost")
      .map(s => {
        const stage = PIPELINE_STAGES.find(p => p.key === s);
        return { key: s, label: stage?.label || LEAD_STATUS_CONFIG[s].label, color: stage?.color || "hsl(210, 10%, 60%)", count: leads.filter(l => l.status === s).length };
      });
    setStatusCounts(counts);

    // 1. SALGSPULS
    let score = 50;
    const meetingsLast14 = leads.filter(l => l.status === "befaring" && l.updated_at && new Date(l.updated_at) >= new Date(d14)).length;
    score += Math.min(meetingsLast14 * 5, 20);
    const offersSent14 = offers.filter(o => o.status !== "draft" && o.created_at && new Date(o.created_at) >= new Date(d14)).length;
    score += Math.min(offersSent14 * 5, 20);
    const activeLeads = leads.filter(l => !["won", "lost"].includes(l.status));
    if (activeLeads.length > 0 && activeLeads.every(l => l.updated_at && new Date(l.updated_at) >= new Date(d7))) score += 10;
    const sentOffers = offers.filter(o => o.status === "sent");
    if (sentOffers.length === 0 || sentOffers.every(o => (now.getTime() - new Date(o.created_at).getTime()) / 86400000 < 7)) score += 10;
    const inactiveLeads = activeLeads.filter(l => !l.updated_at || new Date(l.updated_at) < new Date(d7)).length;
    if (inactiveLeads > 5) score -= 5;
    const offersWithoutFollowup = sentOffers.filter(o => (now.getTime() - new Date(o.created_at).getTime()) / 86400000 > 5).length;
    if (offersWithoutFollowup > 3) score -= 5;
    if (meetingsLast14 === 0) score -= 10;
    score = Math.max(0, Math.min(100, score));
    const pulsStatus: StatusColor = score >= 70 ? "green" : score >= 50 ? "yellow" : "red";

    // 2. PIPELINE
    const pipelineValue = leads.filter(l => !["won", "lost"].includes(l.status)).reduce((s, l) => s + Number(l.estimated_value || 0) * (Number(l.probability || 50) / 100), 0);
    const quarterlyTarget = 2_000_000;
    const pipelinePct = quarterlyTarget > 0 ? (pipelineValue / quarterlyTarget) * 100 : 0;
    const pipelineStatus: StatusColor = pipelinePct >= 100 ? "green" : pipelinePct >= 80 ? "yellow" : "red";

    // 3. VINNRATE
    const offers90 = offers.filter(o => new Date(o.created_at) >= new Date(d90));
    const sent90 = offers90.filter(o => o.status !== "draft").length;
    const won90 = offers90.filter(o => o.status === "accepted" || o.status === "signed").length;
    const winRate = sent90 > 0 ? (won90 / sent90) * 100 : 0;
    const winStatus: StatusColor = winRate >= 35 ? "green" : winRate >= 20 ? "yellow" : "red";

    // 4. MOMENTUM
    const offersLast30 = offers.filter(o => o.status !== "draft" && new Date(o.created_at) >= new Date(d30)).length;
    const offersPrev30 = offers.filter(o => o.status !== "draft" && new Date(o.created_at) >= new Date(d60) && new Date(o.created_at) < new Date(d30)).length;
    const momentumPct = offersPrev30 > 0 ? ((offersLast30 - offersPrev30) / offersPrev30) * 100 : (offersLast30 > 0 ? 100 : 0);
    const momentumStatus: StatusColor = momentumPct > 10 ? "green" : momentumPct >= -20 ? "yellow" : "red";
    const momentumGaugePct = Math.max(0, Math.min(100, 50 + momentumPct / 2));
    const activitiesLast14 = meetingsLast14 + offersSent14;

    setTempo(getTempoMessage(score, pipelinePct, winRate, momentumPct));

    setGauges([
      {
        key: "salgspuls", label: "Salgspuls", value: `${score}`, pct: score, status: pulsStatus,
        subLabel: `${activitiesLast14} aktiviteter siste 14d`,
        size: isMobile ? 120 : 190, emphasis: true,
        href: "/sales/leads?sort=activity_desc&range=14d", icon: <Zap className="h-3.5 w-3.5" />,
      },
      {
        key: "pipeline", label: "Pipeline", value: `${Math.round(pipelinePct)}%`, pct: Math.min(pipelinePct, 100), status: pipelineStatus,
        subLabel: `kr ${(pipelineValue / 1000).toFixed(0)}k mot ${(quarterlyTarget / 1_000_000).toFixed(1)}M`,
        size: isMobile ? 100 : 155,
        href: "/sales/pipeline", icon: <Target className="h-3.5 w-3.5" />,
      },
      {
        key: "vinnrate", label: "Vinnrate", value: `${winRate.toFixed(0)}%`, pct: Math.min(winRate, 100), status: winStatus,
        subLabel: `${won90}/${sent90} (90d)`,
        size: isMobile ? 85 : 120,
        href: "/sales/offers?filter=sent_last_90d", icon: <Trophy className="h-3 w-3" />,
      },
      {
        key: "momentum", label: "Momentum", value: `${momentumPct > 0 ? "+" : ""}${momentumPct.toFixed(0)}%`,
        pct: momentumGaugePct, status: momentumStatus,
        subLabel: `${offersLast30} vs ${offersPrev30}`,
        size: isMobile ? 85 : 120,
        href: "/sales/offers?filter=sent_last_30d", icon: <TrendingUp className="h-3 w-3" />,
      },
    ]);

    // Actions
    const actionItems: ActionItem[] = [];
    if (inactiveLeads > 0) actionItems.push({ label: "Leads uten aktivitet > 7d", count: inactiveLeads, severity: inactiveLeads > 5 ? "high" : "medium", href: "/sales/leads?filter=inactive_7d" });
    if (offersWithoutFollowup > 0) actionItems.push({ label: "Tilbud uten oppfølging > 5d", count: offersWithoutFollowup, severity: offersWithoutFollowup > 3 ? "high" : "medium", href: "/sales/offers?filter=no_followup" });
    const leadsWithCalcNoOffer = leads.filter(l => { const hasCalc = calcs.some(c => (c as any).lead_id === l.id && (c as any).status === "completed"); const hasOffer = offers.some(o => (o as any).lead_id === l.id); return hasCalc && !hasOffer; }).length;
    if (leadsWithCalcNoOffer > 0) actionItems.push({ label: "Kalkyle ferdig, mangler tilbud", count: leadsWithCalcNoOffer, severity: "medium", href: "/sales/calculations?filter=ready_no_offer" });
    const rejectedLast30 = offers.filter(o => o.status === "rejected" && new Date(o.created_at) >= new Date(d30)).length;
    if (rejectedLast30 > 0) actionItems.push({ label: "Avviste tilbud siste 30d", count: rejectedLast30, severity: "medium", href: "/sales/offers?filter=rejected" });

    setActions(actionItems.slice(0, 5));
    setLoading(false);
  }

  if (loading) {
    return <div className="animate-pulse"><div className="bg-secondary/30 h-48 rounded-xl" /></div>;
  }

  const primary = gauges[0]; // Salgspuls
  const secondary = gauges[1]; // Pipeline
  const tertiary = gauges.slice(2); // Vinnrate, Momentum

  // ── Mobile layout ──
  if (isMobile) {
    return (
      <div className="space-y-1.5">
        {/* Gauges row */}
        <div className="bg-secondary/20 border-b border-border/10 px-3 py-2.5">
          <div className="flex items-end justify-center gap-1">
            {gauges.map(g => <GaugeButton key={g.key} g={g} nav={nav} />)}
          </div>
        </div>

        {/* Tempo */}
        {tempo.message && (
          <div className="px-3 flex items-center gap-2 flex-wrap">
            <p className="text-[11px] text-muted-foreground/60 flex-1">{tempo.message}</p>
            <button onClick={() => nav(tempo.actionHref)}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-primary/70 px-2.5 py-1 rounded-full border border-primary/15 bg-primary/5 hover:bg-primary/10 active:scale-[0.97] transition-all cursor-pointer">
              <Lightbulb className="h-3 w-3" /> {tempo.action}
            </button>
          </div>
        )}

        {/* Pipeline Flow */}
        <PipelineFlow statusCounts={statusCounts} nav={nav} />

        {/* Actions */}
        <ActionsPanel actions={actions} nav={nav} />

        {/* Quick filters */}
        <div className="flex items-center gap-1.5 px-3 pb-1 flex-wrap">
          {QUICK_FILTERS.map(f => (
            <button key={f.label} onClick={() => nav(f.href)}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground/60 px-2.5 py-1 rounded-full border border-border/25 bg-background/40 hover:bg-primary/10 hover:text-primary hover:border-primary/20 active:scale-[0.97] transition-all cursor-pointer">
              {f.icon} {f.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Desktop: asymmetric 65/35 ──
  return (
    <div className="space-y-1.5">
      {/* ── Top bar: asymmetric gauges ── */}
      <div className="bg-secondary/20 border-b border-border/10 px-4 py-2">
        <div className="flex items-end gap-0 max-w-5xl">
          {/* Primary: Salgspuls – largest */}
          <GaugeButton g={primary} nav={nav} />
          {/* Secondary: Pipeline */}
          <GaugeButton g={secondary} nav={nav} />
          {/* Tertiary: smaller gauges side by side */}
          <div className="flex items-end gap-0">
            {tertiary.map(g => <GaugeButton key={g.key} g={g} nav={nav} />)}
          </div>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="grid grid-cols-[1fr_340px] gap-1.5 px-4">
        {/* LEFT: operative */}
        <div className="space-y-1.5">
          {/* Pipeline Flow */}
          <PipelineFlow statusCounts={statusCounts} nav={nav} />

          {/* Tempo + chips */}
          {tempo.message && (
            <div className="bg-secondary/15 rounded-lg px-3.5 py-2.5 flex items-center gap-3 flex-wrap">
              <p className="text-[11px] text-muted-foreground/60 flex-1 min-w-0">{tempo.message}</p>
              <button onClick={() => nav(tempo.actionHref)}
                className="inline-flex items-center gap-1.5 text-[10px] font-medium text-primary/70 px-3 py-1 rounded-full border border-primary/15 bg-primary/5 hover:bg-primary/10 active:scale-[0.97] transition-all cursor-pointer shrink-0">
                <Lightbulb className="h-3 w-3" /> {tempo.action}
              </button>
            </div>
          )}

          {/* Quick filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {QUICK_FILTERS.map(f => (
              <button key={f.label} onClick={() => nav(f.href)}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground/60 px-2.5 py-1 rounded-full border border-border/25 bg-background/40 hover:bg-primary/10 hover:text-primary hover:border-primary/20 active:scale-[0.97] transition-all cursor-pointer">
                {f.icon} {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT: control panel */}
        <div className="space-y-1.5">
          <ActionsPanel actions={actions} nav={nav} />
        </div>
      </div>
    </div>
  );
}

// ── Pipeline Flow ──
function PipelineFlow({ statusCounts, nav }: { statusCounts: { key: LeadStatus; label: string; color: string; count: number }[]; nav: (p: string) => void }) {
  return (
    <div className="rounded-lg bg-card shadow-sm p-3">
      <button onClick={() => nav("/sales/pipeline")}
        className="flex items-center justify-between w-full mb-2 group cursor-pointer">
        <h4 className="text-[10px] font-semibold text-foreground/80 uppercase tracking-wider group-hover:text-primary group-hover:underline underline-offset-2 transition-colors">
          Pipeline Flow
        </h4>
        <span className="text-[9px] text-muted-foreground/30 group-hover:text-primary/50 transition-colors flex items-center gap-0.5">
          Åpne <ArrowRight className="h-2.5 w-2.5" />
        </span>
      </button>
      {statusCounts.some(s => s.count > 0) ? (
        <div className="flex items-end gap-1 h-24">
          {statusCounts.map(s => {
            const maxVal = Math.max(...statusCounts.map(p => p.count), 1);
            const h = (s.count / maxVal) * 100;
            return (
              <button key={s.key} onClick={(e) => { e.stopPropagation(); nav(`/sales/leads?status=${s.key}`); }}
                className="flex-1 flex flex-col items-center gap-0 group/step cursor-pointer rounded py-0.5 hover:bg-secondary/50 active:scale-[0.98] transition-all duration-150"
                aria-label={`${s.label}: ${s.count}`}>
                <span className="text-[9px] text-muted-foreground/50 font-mono group-hover/step:text-foreground transition-colors">
                  {s.count > 0 ? s.count : ""}
                </span>
                <div className="w-full rounded-t transition-all duration-500 group-hover/step:opacity-90"
                  style={{ height: `${Math.max(h, 4)}%`, backgroundColor: s.color, opacity: 0.5 }} />
                <div className="flex items-center gap-0.5 mt-0.5">
                  <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-[7px] sm:text-[8px] text-muted-foreground/50 truncate max-w-[50px] group-hover/step:text-foreground transition-colors">
                    {s.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center py-4 gap-1.5">
          <p className="text-[11px] text-muted-foreground/50">Ingen data i pipeline</p>
          <button onClick={() => nav("/sales/pipeline")}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary px-3 py-1.5 rounded-lg border border-primary/20 hover:bg-primary/10 active:scale-[0.97] transition-all cursor-pointer">
            Gå til pipeline <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Actions Panel ──
function ActionsPanel({ actions, nav }: { actions: ActionItem[]; nav: (p: string) => void }) {
  return (
    <div className="rounded-lg bg-card shadow-sm p-3">
      <button onClick={() => nav("/sales/leads?filter=needs_action")}
        className="flex items-center justify-between w-full mb-2 group cursor-pointer">
        <h4 className="text-[10px] font-semibold text-foreground/80 uppercase tracking-wider group-hover:text-primary group-hover:underline underline-offset-2 transition-colors flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> Krever handling
        </h4>
        <span className="text-[9px] text-muted-foreground/30 group-hover:text-primary/50 transition-colors flex items-center gap-0.5">
          Alle <ArrowRight className="h-2.5 w-2.5" />
        </span>
      </button>
      {actions.length > 0 ? (
        <div>
          {actions.map((a, i) => (
            <button key={i} onClick={() => nav(a.href)}
              className="flex items-center gap-2 py-2 px-1.5 w-full text-left border-b border-border/5 last:border-0
                         rounded hover:bg-secondary/40 hover:translate-x-0.5 active:scale-[0.99]
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
                         transition-all duration-150 cursor-pointer group/action">
              <div className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: a.severity === "high" ? "hsl(0, 50%, 58%)" : "hsl(38, 60%, 52%)" }} />
              <span className="text-[12px] text-foreground/70 flex-1 truncate group-hover/action:text-foreground">{a.label}</span>
              <span className={`text-[11px] font-mono font-medium px-1.5 py-0.5 rounded ${a.severity === "high" ? "text-destructive/60 bg-destructive/5" : "text-muted-foreground/60 bg-secondary/50"}`}>
                {a.count}
              </span>
              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/0 group-hover/action:text-primary/40 transition-all shrink-0" />
            </button>
          ))}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 py-1.5 px-1.5 mb-0.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500/50" />
            <span className="text-[12px] text-muted-foreground/60">Ingen kritiske oppgaver. God kontroll.</span>
          </div>
          {OK_ROWS.map((txt, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 px-1.5 opacity-35">
              <div className="h-1.5 w-1.5 rounded-full shrink-0 bg-emerald-400/40" />
              <span className="text-[12px] text-muted-foreground/40 flex-1">{txt}</span>
              <span className="text-[9px] text-emerald-500/40 font-mono">0</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
