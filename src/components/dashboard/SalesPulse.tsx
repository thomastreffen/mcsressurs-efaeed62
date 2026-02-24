import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveLeads } from "@/lib/lead-queries";
import { useIsMobile } from "@/hooks/use-mobile";
import { PIPELINE_STAGES, LEAD_STATUS_CONFIG, ALL_LEAD_STATUSES, type LeadStatus } from "@/lib/lead-status";
import { ArrowRight, TrendingUp, Target, Trophy, Zap, AlertCircle, Clock, FileText, Send } from "lucide-react";

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

// ── Donut gauge ──
function DonutGauge({ pct, status, size = 190, emphasis = false }: { pct: number; status: StatusColor; size?: number; emphasis?: boolean }) {
  const strokeWidth = emphasis ? 16 : 14;
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
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block mx-auto">
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

// ── Action item ──
interface ActionItem {
  label: string;
  count: number;
  severity: "high" | "medium";
  href: string;
}

// ── Pulse message ──
function getPulseMessage(score: number): string {
  if (score >= 80) return "Bra trykk siste 14 dager";
  if (score >= 60) return "Jevn aktivitet. Fortsett slik";
  if (score >= 40) return "Rolig periode. Prioriter oppfølging";
  return "Lav aktivitet. Fokuser på møter og tilbud";
}

// ── Quick filter chips ──
const QUICK_FILTERS = [
  { label: "Inaktive >7d", href: "/sales/leads?filter=inactive_7d", icon: <Clock className="h-3 w-3" /> },
  { label: "Kalkyle uten tilbud", href: "/sales/calculations?filter=ready_no_offer", icon: <FileText className="h-3 w-3" /> },
  { label: "Tilbud uten oppfølging", href: "/sales/offers?filter=no_followup", icon: <Send className="h-3 w-3" /> },
  { label: "Denne uken", href: "/sales/leads?sort=activity_desc&range=7d", icon: <TrendingUp className="h-3 w-3" /> },
];

// ── OK placeholder rows for empty action list ──
const OK_ROWS = [
  "Alle leads er fulgt opp",
  "Ingen ventende kalkyler",
  "Tilbud er under oppfølging",
];

// ── Main component ──
export function SalesPulse() {
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [gauges, setGauges] = useState<SalesGauge[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [statusCounts, setStatusCounts] = useState<{ key: LeadStatus; label: string; color: string; count: number }[]>([]);

  // Extra data for contextual sub-labels
  const [extraCtx, setExtraCtx] = useState({
    activitiesLast14: 0,
    pipelineValue: 0,
    quarterlyTarget: 2_000_000,
    wonCount: 0,
    sentCount: 0,
    offersLast30: 0,
    offersPrev30: 0,
  });

  useEffect(() => { fetchSalesData(); }, []);

  async function fetchSalesData() {
    setLoading(true);
    const now = new Date();
    const d14 = new Date(now.getTime() - 14 * 86400000).toISOString();
    const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();
    const d60 = new Date(now.getTime() - 60 * 86400000).toISOString();
    const d90 = new Date(now.getTime() - 90 * 86400000).toISOString();
    const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();
    const d5 = new Date(now.getTime() - 5 * 86400000).toISOString();

    const leadsRes = await fetchActiveLeads("id, status, estimated_value, probability, next_action_date, updated_at, created_at");
    const [offersRes, calcsRes] = await Promise.all([
      supabase.from("offers").select("id, status, created_at, total_inc_vat, lead_id").order("created_at", { ascending: false }),
      supabase.from("calculations").select("id, lead_id, status").is("deleted_at", null),
    ]);

    const leads = leadsRes.data;
    const offers = offersRes.data || [];
    const calcs = calcsRes.data || [];

    // ── Status counts ──
    const counts = ALL_LEAD_STATUSES
      .filter(s => s !== "won" && s !== "lost")
      .map(s => {
        const stage = PIPELINE_STAGES.find(p => p.key === s);
        return {
          key: s,
          label: stage?.label || LEAD_STATUS_CONFIG[s].label,
          color: stage?.color || "hsl(210, 10%, 60%)",
          count: leads.filter(l => l.status === s).length,
        };
      });
    setStatusCounts(counts);

    // ── 1. SALGSPULS ──
    let score = 50;
    const meetingsLast14 = leads.filter(l => l.status === "befaring" && l.updated_at && new Date(l.updated_at) >= new Date(d14)).length;
    score += Math.min(meetingsLast14 * 5, 20);

    const offersSent14 = offers.filter(o => o.status !== "draft" && o.created_at && new Date(o.created_at) >= new Date(d14)).length;
    score += Math.min(offersSent14 * 5, 20);

    const activeLeads = leads.filter(l => !["won", "lost"].includes(l.status));
    const allActive7 = activeLeads.length > 0 && activeLeads.every(l => l.updated_at && new Date(l.updated_at) >= new Date(d7));
    if (allActive7) score += 10;

    const sentOffers = offers.filter(o => o.status === "sent");
    const allFollowedUp = sentOffers.length === 0 || sentOffers.every(o => {
      const daysSince = (now.getTime() - new Date(o.created_at).getTime()) / 86400000;
      return daysSince < 7;
    });
    if (allFollowedUp) score += 10;

    const inactiveLeads = activeLeads.filter(l => !l.updated_at || new Date(l.updated_at) < new Date(d7)).length;
    if (inactiveLeads > 5) score -= 5;

    const offersWithoutFollowup = sentOffers.filter(o => {
      const daysSince = (now.getTime() - new Date(o.created_at).getTime()) / 86400000;
      return daysSince > 5;
    }).length;
    if (offersWithoutFollowup > 3) score -= 5;
    if (meetingsLast14 === 0) score -= 10;

    score = Math.max(0, Math.min(100, score));
    const pulsStatus: StatusColor = score >= 70 ? "green" : score >= 50 ? "yellow" : "red";

    // ── 2. PIPELINE ──
    const pipelineValue = leads
      .filter(l => !["won", "lost"].includes(l.status))
      .reduce((s, l) => s + Number(l.estimated_value || 0) * (Number(l.probability || 50) / 100), 0);
    const quarterlyTarget = 2_000_000;
    const pipelinePct = quarterlyTarget > 0 ? (pipelineValue / quarterlyTarget) * 100 : 0;
    const pipelineStatus: StatusColor = pipelinePct >= 100 ? "green" : pipelinePct >= 80 ? "yellow" : "red";

    // ── 3. VINNRATE ──
    const offers90 = offers.filter(o => new Date(o.created_at) >= new Date(d90));
    const sent90 = offers90.filter(o => o.status !== "draft").length;
    const won90 = offers90.filter(o => o.status === "accepted" || o.status === "signed").length;
    const winRate = sent90 > 0 ? (won90 / sent90) * 100 : 0;
    const winStatus: StatusColor = winRate >= 35 ? "green" : winRate >= 20 ? "yellow" : "red";

    // ── 4. MOMENTUM ──
    const offersLast30 = offers.filter(o => o.status !== "draft" && new Date(o.created_at) >= new Date(d30)).length;
    const offersPrev30 = offers.filter(o => o.status !== "draft" && new Date(o.created_at) >= new Date(d60) && new Date(o.created_at) < new Date(d30)).length;
    const momentumPct = offersPrev30 > 0 ? ((offersLast30 - offersPrev30) / offersPrev30) * 100 : (offersLast30 > 0 ? 100 : 0);
    const momentumStatus: StatusColor = momentumPct > 10 ? "green" : momentumPct >= -20 ? "yellow" : "red";
    const momentumGaugePct = Math.max(0, Math.min(100, 50 + momentumPct / 2));

    const activitiesLast14 = meetingsLast14 + offersSent14;

    setExtraCtx({
      activitiesLast14,
      pipelineValue,
      quarterlyTarget,
      wonCount: won90,
      sentCount: sent90,
      offersLast30,
      offersPrev30,
    });

    const mobileSize = 120;
    setGauges([
      {
        key: "salgspuls", label: "SALGSPULS",
        value: `${score}`, pct: score, status: pulsStatus,
        subLabel: `${activitiesLast14} aktiviteter siste 14d`,
        size: isMobile ? mobileSize + 10 : 200, emphasis: true,
        href: "/sales/leads?sort=activity_desc&range=14d",
        icon: <Zap className="h-3.5 w-3.5" />,
      },
      {
        key: "pipeline", label: "PIPELINE",
        value: `${Math.round(pipelinePct)}%`, pct: Math.min(pipelinePct, 100), status: pipelineStatus,
        subLabel: `kr ${(pipelineValue / 1000).toFixed(0)}k vektet mot ${(quarterlyTarget / 1_000_000).toFixed(1)}M`,
        size: isMobile ? mobileSize : 190,
        href: "/sales/pipeline",
        icon: <Target className="h-3.5 w-3.5" />,
      },
      {
        key: "vinnrate", label: "VINNRATE",
        value: `${winRate.toFixed(0)}%`, pct: Math.min(winRate, 100), status: winStatus,
        subLabel: `${won90} vunnet av ${sent90} sendt (90d)`,
        size: isMobile ? mobileSize - 5 : 180,
        href: "/sales/offers?filter=sent_last_90d",
        icon: <Trophy className="h-3.5 w-3.5" />,
      },
      {
        key: "momentum", label: "MOMENTUM",
        value: `${momentumPct > 0 ? "+" : ""}${momentumPct.toFixed(0)}%`,
        pct: momentumGaugePct, status: momentumStatus,
        subLabel: `${offersLast30} tilbud siste 30d vs ${offersPrev30} forrige`,
        size: isMobile ? mobileSize - 5 : 180,
        href: "/sales/offers?filter=sent_last_30d",
        icon: <TrendingUp className="h-3.5 w-3.5" />,
      },
    ]);

    // ── Actions ──
    const actionItems: ActionItem[] = [];
    if (inactiveLeads > 0) actionItems.push({
      label: "Leads uten aktivitet > 7 dager", count: inactiveLeads,
      severity: inactiveLeads > 5 ? "high" : "medium",
      href: "/sales/leads?filter=inactive_7d",
    });
    if (offersWithoutFollowup > 0) actionItems.push({
      label: "Tilbud uten oppfølging > 5 dager", count: offersWithoutFollowup,
      severity: offersWithoutFollowup > 3 ? "high" : "medium",
      href: "/sales/offers?filter=no_followup",
    });

    const leadsWithCalcNoOffer = leads.filter(l => {
      const hasCalc = calcs.some(c => (c as any).lead_id === l.id && (c as any).status === "completed");
      const hasOffer = offers.some(o => (o as any).lead_id === l.id);
      return hasCalc && !hasOffer;
    }).length;
    if (leadsWithCalcNoOffer > 0) actionItems.push({
      label: "Kalkyle ferdig, tilbud ikke generert", count: leadsWithCalcNoOffer,
      severity: "medium", href: "/sales/calculations?filter=ready_no_offer",
    });

    const rejectedLast30 = offers.filter(o => o.status === "rejected" && new Date(o.created_at) >= new Date(d30)).length;
    if (rejectedLast30 > 0) actionItems.push({
      label: "Avviste tilbud siste 30 dager", count: rejectedLast30,
      severity: "medium", href: "/sales/offers?filter=rejected",
    });

    setActions(actionItems.slice(0, 5));
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="bg-secondary/30 h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Gauge top-bar ── */}
      <div className="bg-secondary/30 border-b border-border/10 px-3.5 sm:px-5 py-3.5 sm:py-4">
        <h3 className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest mb-3">
          Salgspuls
        </h3>
        <div className="flex items-end justify-center gap-2 sm:gap-4 max-w-5xl mx-auto">
          {gauges.map((g) => (
            <button
              key={g.key}
              onClick={() => nav(g.href)}
              className="flex flex-col items-center text-center group cursor-pointer rounded-xl px-2 py-2
                         hover:bg-background/60 hover:shadow-sm
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1
                         transition-all duration-150"
              style={{ minWidth: isMobile ? 80 : 120 }}
              aria-label={`${g.label} – ${g.value}`}
            >
              <span className="text-[9px] font-medium text-muted-foreground/70 uppercase tracking-widest mb-1
                               group-hover:text-foreground transition-colors flex items-center gap-1">
                {g.icon} {g.label}
              </span>
              <div className="relative" style={{ width: g.size, height: g.size }}>
                <DonutGauge pct={g.pct} status={g.status} size={g.size} emphasis={g.emphasis} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className={`font-semibold text-foreground font-mono leading-none ${g.emphasis ? "text-3xl sm:text-4xl" : "text-2xl sm:text-[2rem]"}`}>
                    {g.value}
                  </p>
                </div>
              </div>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground/70 mt-0.5 max-w-[160px]
                            group-hover:text-foreground/80 transition-colors">
                {g.subLabel}
              </p>
              <span className="text-[9px] text-primary/0 group-hover:text-primary/70 transition-colors mt-0.5 flex items-center gap-0.5">
                Vis detaljer <ArrowRight className="h-2.5 w-2.5" />
              </span>
            </button>
          ))}
        </div>

        {/* ── Quick filter chips ── */}
        <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => nav(f.href)}
              className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-medium
                         text-muted-foreground/80 px-3 py-1.5 rounded-full
                         border border-border/40 bg-background/50
                         hover:bg-primary/10 hover:text-primary hover:border-primary/30
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
                         transition-all duration-150 cursor-pointer"
            >
              {f.icon} {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Analyse section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 px-4 sm:px-5">
        {/* Pipeline Flow */}
        <div className="lg:col-span-3 rounded-xl bg-card shadow-sm p-4 sm:p-5">
          <button
            onClick={() => nav("/sales/pipeline")}
            className="flex items-center justify-between w-full mb-4 group cursor-pointer"
            aria-label="Åpne pipeline"
          >
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider
                           group-hover:text-primary transition-colors">
              Pipeline Flow
            </h4>
            <span className="text-[10px] text-muted-foreground/50 group-hover:text-primary/70 transition-colors flex items-center gap-1">
              Åpne pipeline <ArrowRight className="h-3 w-3" />
            </span>
          </button>
          {statusCounts.length > 0 && statusCounts.some(s => s.count > 0) ? (
            <div className="flex items-end gap-1.5 h-32">
              {statusCounts.map((s) => {
                const maxVal = Math.max(...statusCounts.map(p => p.count), 1);
                const h = (s.count / maxVal) * 100;
                return (
                  <button
                    key={s.key}
                    onClick={(e) => { e.stopPropagation(); nav(`/sales/leads?status=${s.key}`); }}
                    className="flex-1 flex flex-col items-center gap-1 group/step cursor-pointer
                               rounded-lg py-1 hover:bg-secondary/40 transition-all duration-150"
                    aria-label={`${s.label}: ${s.count} leads`}
                  >
                    <span className="text-[9px] text-muted-foreground/70 font-mono group-hover/step:text-foreground transition-colors">
                      {s.count > 0 ? s.count : ""}
                    </span>
                    <div
                      className="w-full rounded-t transition-all duration-500 group-hover/step:opacity-70"
                      style={{
                        height: `${Math.max(h, 4)}%`,
                        backgroundColor: "hsl(210, 8%, 84%)",
                      }}
                    />
                    <div className="flex items-center gap-1">
                      <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-[8px] sm:text-[9px] text-muted-foreground/70 truncate max-w-[60px]
                                       group-hover/step:text-foreground transition-colors">
                        {s.label}
                      </span>
                    </div>
                    <span className="text-[8px] text-primary/0 group-hover/step:text-primary/60 transition-colors">
                      Se leads →
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <p className="text-sm text-muted-foreground/70">Ingen data i pipeline</p>
              <button
                onClick={() => nav("/sales/pipeline")}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary
                           px-4 py-2 rounded-lg border border-primary/20
                           hover:bg-primary/10 transition-all duration-150 cursor-pointer"
              >
                Gå til pipeline <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Krever handling nå */}
        <div className="lg:col-span-2 rounded-xl bg-card shadow-sm p-4 sm:p-5">
          <button
            onClick={() => nav("/sales/leads?filter=needs_action")}
            className="flex items-center justify-between w-full mb-3 group cursor-pointer"
            aria-label="Vis alle handlinger"
          >
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider
                           group-hover:text-primary transition-colors flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Krever handling nå
            </h4>
            <span className="text-[10px] text-muted-foreground/50 group-hover:text-primary/70 transition-colors flex items-center gap-1">
              Se alle <ArrowRight className="h-3 w-3" />
            </span>
          </button>
          {actions.length > 0 ? (
            <div className="space-y-0.5">
              {actions.map((a, i) => (
                <button
                  key={i}
                  onClick={() => nav(a.href)}
                  className="flex items-center gap-3 py-2.5 px-2 w-full text-left
                             border-b border-border/10 last:border-0
                             rounded-lg hover:bg-secondary/40
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
                             transition-all duration-150 cursor-pointer group/action"
                  aria-label={`${a.label}: ${a.count}`}
                >
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: a.severity === "high" ? "hsl(0, 50%, 58%)" : "hsl(38, 60%, 52%)" }}
                  />
                  <span className="text-sm text-foreground flex-1 truncate group-hover/action:text-foreground/90">
                    {a.label}
                  </span>
                  <span className={`text-xs font-mono font-medium px-1.5 py-0.5 rounded ${a.severity === "high" ? "text-destructive/80" : "text-muted-foreground"}`}>
                    {a.count}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/30 group-hover/action:text-primary/60 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {OK_ROWS.map((txt, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 py-2.5 px-2 rounded-lg opacity-50"
                >
                  <div className="h-2 w-2 rounded-full shrink-0 bg-emerald-400/40" />
                  <span className="text-sm text-muted-foreground/60 flex-1">{txt}</span>
                  <span className="text-[10px] text-emerald-500/60">OK</span>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground/50 text-center pt-2">
                Systemet er i balanse. Ingen kritiske oppgaver.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
