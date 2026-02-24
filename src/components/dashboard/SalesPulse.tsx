import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";

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
}

// ── Donut gauge (same visual language as PortfolioHealthGauges) ──

function DonutGauge({ pct, status, size = 190, emphasis = false }: { pct: number; status: StatusColor; size?: number; emphasis?: boolean }) {
  const strokeWidth = emphasis ? 16 : 14;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct / 100));
  const dashLen = clamped * circumference;

  const strokeColor = status === "green"
    ? emphasis ? "hsl(152, 60%, 38%)" : "hsl(152, 40%, 48%)"
    : status === "yellow"
      ? emphasis ? "hsl(28, 80%, 52%)" : "hsl(28, 55%, 56%)"
      : emphasis ? "hsl(0, 72%, 51%)" : "hsl(0, 50%, 55%)";

  const trackColor = pct <= 0 ? "hsl(152, 30%, 82%)" : "hsl(210, 10%, 92%)";

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

// ── Action list item ──

interface ActionItem {
  label: string;
  count: number;
  severity: "high" | "medium";
}

// ── Main component ──

export function SalesPulse() {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [gauges, setGauges] = useState<SalesGauge[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [pipelineData, setPipelineData] = useState<{ month: string; value: number }[]>([]);

  useEffect(() => {
    fetchSalesData();
  }, []);

  async function fetchSalesData() {
    setLoading(true);
    const now = new Date();
    const d14 = new Date(now.getTime() - 14 * 86400000).toISOString();
    const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();
    const d60 = new Date(now.getTime() - 60 * 86400000).toISOString();
    const d90 = new Date(now.getTime() - 90 * 86400000).toISOString();
    const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();

    const [leadsRes, offersRes, allLeadsRes] = await Promise.all([
      supabase.from("leads").select("id, status, estimated_value, probability, next_action_date, updated_at, created_at").is("deleted_at", null),
      supabase.from("offers").select("id, status, created_at, total_inc_vat").order("created_at", { ascending: false }),
      supabase.from("leads").select("id, updated_at, next_action_date, status").is("deleted_at", null),
    ]);

    const leads = leadsRes.data || [];
    const offers = offersRes.data || [];
    const allLeads = allLeadsRes.data || [];

    // ── 1. SALGSPULS (Activity Score) ──
    let score = 50;

    // Meetings (leads with befaring status in last 14 days - proxy)
    const meetingsLast14 = leads.filter(l =>
      l.status === "befaring" && l.updated_at && new Date(l.updated_at) >= new Date(d14)
    ).length;
    score += Math.min(meetingsLast14 * 5, 20);

    // Offers sent last 14 days
    const offersSent14 = offers.filter(o =>
      o.status !== "draft" && o.created_at && new Date(o.created_at) >= new Date(d14)
    ).length;
    score += Math.min(offersSent14 * 5, 20);

    // All active leads have activity < 7 days
    const activeLeads = allLeads.filter(l => !["won", "lost"].includes(l.status));
    const allActive7 = activeLeads.length > 0 && activeLeads.every(l =>
      l.updated_at && new Date(l.updated_at) >= new Date(d7)
    );
    if (allActive7) score += 10;

    // All offers have follow-up (non-draft offers that are sent have been responded to)
    const sentOffers = offers.filter(o => o.status === "sent");
    const allFollowedUp = sentOffers.length === 0 || sentOffers.every(o => {
      const created = new Date(o.created_at);
      const daysSinceSent = (now.getTime() - created.getTime()) / 86400000;
      return daysSinceSent < 7;
    });
    if (allFollowedUp) score += 10;

    // Penalties
    const inactiveLeads = activeLeads.filter(l =>
      !l.updated_at || new Date(l.updated_at) < new Date(d7)
    ).length;
    if (inactiveLeads > 5) score -= 5;

    const offersWithoutFollowup = sentOffers.filter(o => {
      const daysSince = (now.getTime() - new Date(o.created_at).getTime()) / 86400000;
      return daysSince > 7;
    }).length;
    if (offersWithoutFollowup > 3) score -= 5;

    if (meetingsLast14 === 0) score -= 10;

    score = Math.max(0, Math.min(100, score));

    const pulsStatus: StatusColor = score >= 70 ? "green" : score >= 50 ? "yellow" : "red";

    // ── 2. PIPELINE STYRKE ──
    const pipelineValue = leads
      .filter(l => !["won", "lost"].includes(l.status))
      .reduce((s, l) => s + Number(l.estimated_value || 0) * (Number(l.probability || 50) / 100), 0);

    // Quarterly target: use a reasonable default (can be made configurable)
    const quarterlyTarget = 2_000_000;
    const pipelinePct = quarterlyTarget > 0 ? (pipelineValue / quarterlyTarget) * 100 : 0;
    const pipelineStatus: StatusColor = pipelinePct >= 100 ? "green" : pipelinePct >= 80 ? "yellow" : "red";

    // ── 3. VINNRATE ──
    const offers90 = offers.filter(o => new Date(o.created_at) >= new Date(d90));
    const sent90 = offers90.filter(o => o.status !== "draft").length;
    const won90 = offers90.filter(o => o.status === "accepted" || o.status === "signed").length;
    const winRate = sent90 > 0 ? (won90 / sent90) * 100 : 0;
    const winStatus: StatusColor = winRate >= 35 ? "green" : winRate >= 20 ? "yellow" : "red";

    // ── 4. CLOSING MOMENTUM ──
    const offersLast30 = offers.filter(o => o.status !== "draft" && new Date(o.created_at) >= new Date(d30)).length;
    const offersPrev30 = offers.filter(o => o.status !== "draft" && new Date(o.created_at) >= new Date(d60) && new Date(o.created_at) < new Date(d30)).length;
    const momentumPct = offersPrev30 > 0 ? ((offersLast30 - offersPrev30) / offersPrev30) * 100 : (offersLast30 > 0 ? 100 : 0);
    const momentumStatus: StatusColor = momentumPct > 10 ? "green" : momentumPct >= -20 ? "yellow" : "red";
    // For gauge, show ratio as percentage (capped)
    const momentumGaugePct = Math.max(0, Math.min(100, 50 + momentumPct / 2));

    const mobileSize = 120;
    setGauges([
      {
        key: "salgspuls",
        label: "SALGSPULS",
        value: `${score}`,
        pct: score,
        status: pulsStatus,
        subLabel: "Basert på aktivitet siste 14 dager",
        size: isMobile ? mobileSize + 10 : 200,
        emphasis: true,
      },
      {
        key: "pipeline",
        label: "PIPELINE",
        value: `${Math.round(pipelinePct)}%`,
        pct: Math.min(pipelinePct, 100),
        status: pipelineStatus,
        subLabel: `Mål: ${(quarterlyTarget / 1_000_000).toFixed(1)} MNOK`,
        size: isMobile ? mobileSize : 190,
      },
      {
        key: "vinnrate",
        label: "VINNRATE",
        value: `${winRate.toFixed(0)}%`,
        pct: Math.min(winRate, 100),
        status: winStatus,
        subLabel: "Siste 90 dager",
        size: isMobile ? mobileSize - 5 : 180,
      },
      {
        key: "momentum",
        label: "MOMENTUM",
        value: `${momentumPct > 0 ? "+" : ""}${momentumPct.toFixed(0)}%`,
        pct: momentumGaugePct,
        status: momentumStatus,
        subLabel: "Tilbud siste 30 dager",
        size: isMobile ? mobileSize - 5 : 180,
      },
    ]);

    // ── Actions ──
    const actionItems: ActionItem[] = [];
    if (inactiveLeads > 0) actionItems.push({ label: "Leads uten aktivitet (>7d)", count: inactiveLeads, severity: inactiveLeads > 5 ? "high" : "medium" });
    if (offersWithoutFollowup > 0) actionItems.push({ label: "Tilbud uten oppfølging", count: offersWithoutFollowup, severity: offersWithoutFollowup > 3 ? "high" : "medium" });

    const rejectedLast30 = offers.filter(o => o.status === "rejected" && new Date(o.created_at) >= new Date(d30)).length;
    if (rejectedLast30 > 0) actionItems.push({ label: "Avviste tilbud siste 30 dager", count: rejectedLast30, severity: rejectedLast30 > 2 ? "high" : "medium" });

    setActions(actionItems);

    // ── Pipeline flow data (last 6 months) ──
    const months: { month: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const label = d.toLocaleDateString("nb-NO", { month: "short" });
      const val = offers
        .filter(o => o.status !== "draft" && new Date(o.created_at) >= d && new Date(o.created_at) <= monthEnd)
        .reduce((s, o) => s + Number(o.total_inc_vat || 0), 0);
      months.push({ month: label, value: val });
    }
    setPipelineData(months);

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
      {/* ── Sales-Puls gauges ── */}
      <div className="bg-secondary/30 border-b border-border/10 px-4 sm:px-6 py-4 sm:py-5">
        <h3 className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest mb-4">
          Salgspuls
        </h3>
        <div className="flex items-end justify-center gap-2 sm:gap-4 max-w-5xl mx-auto">
          {gauges.map((g) => (
            <div key={g.key} className="flex flex-col items-center text-center" style={{ minWidth: isMobile ? 80 : 120 }}>
              <span className="text-[9px] font-medium text-muted-foreground/70 uppercase tracking-widest mb-1">
                {g.label}
              </span>
              <div className="relative" style={{ width: g.size, height: g.size }}>
                <DonutGauge pct={g.pct} status={g.status} size={g.size} emphasis={g.emphasis} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className={`font-semibold text-foreground font-mono leading-none ${g.emphasis ? "text-3xl sm:text-4xl" : "text-2xl sm:text-[2rem]"}`}>
                    {g.value}
                  </p>
                </div>
              </div>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground/70 mt-0.5 max-w-[140px]">{g.subLabel}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Analyse section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 px-4 sm:px-6">
        {/* Pipeline Flow chart */}
        <div className="lg:col-span-3 rounded-xl bg-card shadow-sm p-4 sm:p-5">
          <h4 className="text-xs font-semibold text-foreground mb-4 uppercase tracking-wider">Pipeline Flow</h4>
          {pipelineData.length > 0 ? (
            <div className="flex items-end gap-2 h-32">
              {pipelineData.map((d, i) => {
                const maxVal = Math.max(...pipelineData.map(p => p.value), 1);
                const h = (d.value / maxVal) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] text-muted-foreground/70 font-mono">
                      {d.value > 0 ? `${(d.value / 1000).toFixed(0)}k` : ""}
                    </span>
                    <div
                      className="w-full rounded-t transition-all duration-500"
                      style={{
                        height: `${Math.max(h, 2)}%`,
                        backgroundColor: "hsl(210, 10%, 82%)",
                      }}
                    />
                    <span className="text-[9px] text-muted-foreground/70">{d.month}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Ingen data</p>
          )}
        </div>

        {/* Krever handling */}
        <div className="lg:col-span-2 rounded-xl bg-card shadow-sm p-4 sm:p-5">
          <h4 className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wider">Krever handling nå</h4>
          {actions.length > 0 ? (
            <div className="space-y-2">
              {actions.map((a, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-border/10 last:border-0">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: a.severity === "high" ? "hsl(0, 72%, 51%)" : "hsl(28, 80%, 52%)" }}
                  />
                  <span className="text-sm text-foreground flex-1">{a.label}</span>
                  <span className={`text-sm font-mono font-semibold ${a.severity === "high" ? "text-destructive" : "text-muted-foreground"}`}>
                    {a.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/70 text-center py-4">Alt ser bra ut 👍</p>
          )}
        </div>
      </div>
    </div>
  );
}
