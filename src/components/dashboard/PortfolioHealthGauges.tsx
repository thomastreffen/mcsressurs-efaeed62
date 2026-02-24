import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, TrendingUp, ShieldAlert, FilePlus2, Wallet, AlertTriangle } from "lucide-react";
import { JOB_STATUS_CONFIG, type JobStatus } from "@/lib/job-status";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Types ──

type StatusColor = "green" | "yellow" | "red";

interface GaugeData {
  label: string;
  icon: React.ReactNode;
  pct: number;
  status: StatusColor;
  mainLabel: string;
  subLabel: string;
}

interface ProjectHealth {
  id: string;
  title: string;
  customer: string;
  status: StatusColor;
  worstMetric: string;
  totalNow: number;
}

interface RiskFlag {
  label: string;
  count: number;
  severity: "high" | "medium";
}

interface StatusCount {
  name: string;
  value: number;
  color: string;
}

// ── Helpers ──

function fmtNOK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
  return n.toLocaleString("nb-NO");
}

function statusToHsl(s: StatusColor): string {
  if (s === "green") return "hsl(152, 60%, 38%)";
  if (s === "yellow") return "hsl(28, 80%, 52%)";
  return "hsl(0, 72%, 51%)";
}

// ── Half-circle gauge (SVG) ──

function HalfGauge({ pct, status, size = 140 }: { pct: number; status: StatusColor; size?: number }) {
  const r = (size - 16) / 2;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const circumference = Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct / 100));
  const dashLen = clamped * circumference;
  const color = statusToHsl(status);

  return (
    <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`} className="block mx-auto">
      {/* Track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="hsl(210, 15%, 93%)"
        strokeWidth={6}
        strokeLinecap="round"
      />
      {/* Value arc */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${dashLen} ${circumference}`}
        className="transition-all duration-700 ease-out"
      />
    </svg>
  );
}

// ── Main component ──

export function PortfolioHealthGauges() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [gauges, setGauges] = useState<GaugeData[]>([]);
  const [projects, setProjects] = useState<ProjectHealth[]>([]);
  const [riskFlags, setRiskFlags] = useState<RiskFlag[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCount[]>([]);
  const [filter, setFilter] = useState<StatusColor | null>(null);

  useEffect(() => {
    fetchPortfolioData();
  }, []);

  async function fetchPortfolioData() {
    setLoading(true);

    const [jobsRes, summariesRes, cosRes, risksRes, analysesRes] = await Promise.all([
      supabase.from("events").select("id, title, customer, status").is("deleted_at", null),
      supabase.from("job_summaries").select("job_id, key_numbers"),
      supabase.from("job_change_orders").select("job_id, status, amount_ex_vat, linked_risk_id"),
      supabase.from("job_risk_items").select("job_id, severity, status, category, label"),
      supabase.from("document_analyses").select("job_id, parsed_fields, analysis_type").eq("analysis_type", "offer"),
    ]);

    const jobs = jobsRes.data || [];
    const summaries = summariesRes.data || [];
    const cos = cosRes.data || [];
    const risks = risksRes.data || [];
    const analyses = analysesRes.data || [];

    // Active jobs only
    const activeStatuses: JobStatus[] = ["requested", "approved", "scheduled", "in_progress", "time_change_proposed", "ready_for_invoicing"];
    const activeJobs = jobs.filter(j => activeStatuses.includes(j.status as JobStatus));

    // Build maps
    const summaryMap = new Map<string, any>();
    for (const s of summaries) summaryMap.set(s.job_id, (s.key_numbers as any) || {});

    const analysisMap = new Map<string, any>();
    for (const a of analyses) {
      if (!analysisMap.has(a.job_id!)) analysisMap.set(a.job_id!, (a.parsed_fields as any) || {});
    }

    const cosByJob = new Map<string, typeof cos>();
    for (const c of cos) {
      if (!cosByJob.has(c.job_id)) cosByJob.set(c.job_id, []);
      cosByJob.get(c.job_id)!.push(c);
    }

    const risksByJob = new Map<string, typeof risks>();
    for (const r of risks) {
      if (!risksByJob.has(r.job_id)) risksByJob.set(r.job_id, []);
      risksByJob.get(r.job_id)!.push(r);
    }

    // Per-project health
    let totalBase = 0;
    let totalPending = 0;
    let totalOutstanding = 0;
    let totalTotalNow = 0;
    let aggRiskScore = 0;
    let aggRiskCount = 0;
    let aggSent = 0;
    let aggIdentified = 0;

    const projectHealthList: ProjectHealth[] = [];

    // Risk flag aggregation
    const flagCounts = new Map<string, { count: number; severity: "high" | "medium" }>();

    for (const job of activeJobs) {
      const kn = summaryMap.get(job.id) || {};
      const pf = analysisMap.get(job.id) || {};
      let baseValue = kn.total_amount != null ? Number(kn.total_amount) : 0;
      if (baseValue === 0 && pf.total_amount != null) baseValue = Number(pf.total_amount);

      const jobCos = cosByJob.get(job.id) || [];
      const jobRisks = risksByJob.get(job.id) || [];

      const approvedSum = jobCos.filter(c => c.status === "approved" || c.status === "invoiced").reduce((s, c) => s + Number(c.amount_ex_vat || 0), 0);
      const pendingSum = jobCos.filter(c => c.status === "sent" || c.status === "pending").reduce((s, c) => s + Number(c.amount_ex_vat || 0), 0);
      const totalNow = baseValue + approvedSum;

      totalBase += baseValue;
      totalPending += pendingSum;
      totalTotalNow += totalNow;
      totalOutstanding += pendingSum;

      // Risk score
      const projectRisks = jobRisks.filter(r =>
        (r.status === "open" || r.status === "acknowledged") &&
        r.severity !== "low" && r.category !== "documentation"
      );
      let riskScore = 0;
      let highOpen = 0;
      for (const r of projectRisks) {
        if (r.severity === "high") { riskScore += 2; highOpen++; }
        else if (r.severity === "medium") riskScore += 1;
      }
      aggRiskScore += riskScore;
      aggRiskCount++;

      // Tillegg ratio
      const coEligible = new Set(["economic", "schedule"]);
      const openEligible = jobRisks.filter(r => (r.status === "open" || r.status === "acknowledged") && coEligible.has(r.category) && r.severity !== "low").length;
      const sentApproved = jobCos.filter(c => ["sent", "approved", "invoiced"].includes(c.status)).length;
      const identified = Math.max(openEligible, sentApproved);
      aggSent += sentApproved;
      aggIdentified += identified;

      // Risk flags
      for (const r of projectRisks) {
        const key = r.label;
        const existing = flagCounts.get(key);
        if (existing) {
          existing.count++;
          if (r.severity === "high") existing.severity = "high";
        } else {
          flagCounts.set(key, { count: 1, severity: r.severity as "high" | "medium" });
        }
      }

      // Project status
      const pendingPct = baseValue > 0 ? pendingSum / baseValue : 0;
      let econStatus: StatusColor = "green";
      if (pendingPct > 0.15) econStatus = "red";
      else if (pendingPct >= 0.05) econStatus = "yellow";

      let riskStatus: StatusColor = "green";
      if (riskScore >= 9 || highOpen >= 3) riskStatus = "red";
      else if (riskScore >= 4 || highOpen >= 2) riskStatus = "yellow";

      const ratio = identified > 0 ? sentApproved / identified : 1;
      let tilleggStatus: StatusColor = "green";
      if (ratio < 0.70) tilleggStatus = "red";
      else if (ratio < 0.90) tilleggStatus = "yellow";

      const outPct = totalNow > 0 ? pendingSum / totalNow : 0;
      let cashStatus: StatusColor = "green";
      if (outPct > 0.35) cashStatus = "red";
      else if (outPct >= 0.20) cashStatus = "yellow";

      const statuses = [econStatus, riskStatus, tilleggStatus, cashStatus];
      const worst: StatusColor = statuses.includes("red") ? "red" : statuses.includes("yellow") ? "yellow" : "green";
      const worstLabels: Record<StatusColor, string> = { red: "Kritisk", yellow: "Oppfølging", green: "OK" };

      projectHealthList.push({
        id: job.id,
        title: job.title,
        customer: job.customer || "",
        status: worst,
        worstMetric: worstLabels[worst],
        totalNow,
      });
    }

    // Portfolio gauges
    const pendingExposurePct = totalBase > 0 ? (totalPending / totalBase) * 100 : 0;
    const avgRiskScore = aggRiskCount > 0 ? aggRiskScore / aggRiskCount : 0;
    const tilleggRatio = aggIdentified > 0 ? (aggSent / aggIdentified) * 100 : 100;
    const outstandingPct = totalTotalNow > 0 ? (totalOutstanding / totalTotalNow) * 100 : 0;

    // Economy status
    let econGaugeStatus: StatusColor = "green";
    if (pendingExposurePct > 15) econGaugeStatus = "red";
    else if (pendingExposurePct >= 5) econGaugeStatus = "yellow";

    // Risk status (avg)
    let riskGaugeStatus: StatusColor = "green";
    if (avgRiskScore >= 9) riskGaugeStatus = "red";
    else if (avgRiskScore >= 4) riskGaugeStatus = "yellow";

    // Tillegg status
    let tilleggGaugeStatus: StatusColor = "green";
    if (tilleggRatio < 70) tilleggGaugeStatus = "red";
    else if (tilleggRatio < 90) tilleggGaugeStatus = "yellow";

    // Cashflow
    let cashGaugeStatus: StatusColor = "green";
    if (outstandingPct > 35) cashGaugeStatus = "red";
    else if (outstandingPct >= 20) cashGaugeStatus = "yellow";

    setGauges([
      {
        label: "Økonomi",
        icon: <TrendingUp className="h-3.5 w-3.5" />,
        pct: Math.min(pendingExposurePct, 100),
        status: econGaugeStatus,
        mainLabel: `${pendingExposurePct.toFixed(1)} %`,
        subLabel: `NOK ${fmtNOK(totalPending)} avventer`,
      },
      {
        label: "Risiko",
        icon: <ShieldAlert className="h-3.5 w-3.5" />,
        pct: Math.min((avgRiskScore / 12) * 100, 100),
        status: riskGaugeStatus,
        mainLabel: avgRiskScore.toFixed(1),
        subLabel: `Snitt risikopoeng`,
      },
      {
        label: "Tillegg",
        icon: <FilePlus2 className="h-3.5 w-3.5" />,
        pct: Math.min(tilleggRatio, 100),
        status: tilleggGaugeStatus,
        mainLabel: `${tilleggRatio.toFixed(0)} %`,
        subLabel: `${aggSent}/${aggIdentified} sendt`,
      },
      {
        label: "Cashflow",
        icon: <Wallet className="h-3.5 w-3.5" />,
        pct: Math.min(outstandingPct, 100),
        status: cashGaugeStatus,
        mainLabel: `${outstandingPct.toFixed(1)} %`,
        subLabel: `NOK ${fmtNOK(totalOutstanding)} utestående`,
      },
    ]);

    setProjects(projectHealthList);

    // Status breakdown for stacked bar
    const jobStatusCounts: Record<string, number> = {};
    for (const j of jobs) jobStatusCounts[j.status] = (jobStatusCounts[j.status] || 0) + 1;
    const statusColorMap: Record<string, string> = {
      requested: "hsl(28, 80%, 52%)", approved: "hsl(152, 60%, 42%)", scheduled: "hsl(213, 55%, 55%)",
      in_progress: "hsl(213, 60%, 42%)", completed: "hsl(152, 60%, 42%)", time_change_proposed: "hsl(213, 50%, 68%)",
      rejected: "hsl(0, 72%, 51%)", ready_for_invoicing: "hsl(28, 80%, 52%)", invoiced: "hsl(215, 15%, 70%)",
    };
    setStatusCounts(
      Object.entries(jobStatusCounts)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ name: JOB_STATUS_CONFIG[k as JobStatus]?.label || k, value: v, color: statusColorMap[k] || "hsl(215, 15%, 70%)" }))
    );

    // Top 5 risk flags
    const sortedFlags = Array.from(flagCounts.entries())
      .sort((a, b) => {
        if (a[1].severity !== b[1].severity) return a[1].severity === "high" ? -1 : 1;
        return b[1].count - a[1].count;
      })
      .slice(0, 5)
      .map(([label, data]) => ({ label, ...data }));
    setRiskFlags(sortedFlags);

    setLoading(false);
  }

  const counts = useMemo(() => {
    const red = projects.filter(p => p.status === "red");
    const yellow = projects.filter(p => p.status === "yellow");
    const green = projects.filter(p => p.status === "green");
    return { red, yellow, green };
  }, [projects]);

  const filteredProjects = useMemo(() => {
    if (!filter) return [];
    return projects.filter(p => p.status === filter);
  }, [projects, filter]);

  const totalJobs = statusCounts.reduce((s, d) => s + d.value, 0);
  const gaugeSize = isMobile ? 110 : 140;

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="rounded-3xl bg-card h-64" />
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-card h-24" />
          <div className="rounded-2xl bg-card h-24" />
          <div className="rounded-2xl bg-card h-24" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Gauges container ── */}
      <div className="rounded-3xl bg-card shadow-sm p-5 sm:p-8">
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-5">
          Porteføljehelse
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 max-w-4xl mx-auto">
          {gauges.map((g) => (
            <div key={g.label} className="flex flex-col items-center text-center">
              <div className="relative">
                <HalfGauge pct={g.pct} status={g.status} size={gaugeSize} />
                <div
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{ bottom: isMobile ? 2 : 6 }}
                >
                  <p className="text-xl sm:text-2xl font-bold text-foreground font-mono leading-none">
                    {g.mainLabel}
                  </p>
                </div>
              </div>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mt-1">
                {g.icon} {g.label}
              </span>
              <p className="text-[11px] text-muted-foreground mt-0.5">{g.subLabel}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Red / Yellow / Green cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <HealthCountCard
          label="Røde prosjekter"
          count={counts.red.length}
          totalValue={counts.red.reduce((s, p) => s + p.totalNow, 0)}
          color="destructive"
          active={filter === "red"}
          onClick={() => setFilter(filter === "red" ? null : "red")}
        />
        <HealthCountCard
          label="Gule prosjekter"
          count={counts.yellow.length}
          totalValue={counts.yellow.reduce((s, p) => s + p.totalNow, 0)}
          color="accent"
          active={filter === "yellow"}
          onClick={() => setFilter(filter === "yellow" ? null : "yellow")}
        />
        <HealthCountCard
          label="Grønne prosjekter"
          count={counts.green.length}
          totalValue={counts.green.reduce((s, p) => s + p.totalNow, 0)}
          color="success"
          active={filter === "green"}
          onClick={() => setFilter(filter === "green" ? null : "green")}
        />
      </div>

      {/* ── Filtered project list ── */}
      {filter && filteredProjects.length > 0 && (
        <div className="rounded-2xl bg-card shadow-sm p-4 sm:p-5">
          <h4 className="text-xs font-semibold text-foreground mb-3">
            {filter === "red" ? "Røde" : filter === "yellow" ? "Gule" : "Grønne"} prosjekter ({filteredProjects.length})
          </h4>
          <div className="space-y-1">
            {filteredProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/jobs/${p.id}`)}
                className="flex items-center gap-3 w-full rounded-xl p-2.5 text-left hover:bg-secondary/50 transition-colors min-h-[44px]"
              >
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: statusToHsl(p.status) }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.customer}</p>
                </div>
                <span className="text-xs font-mono text-muted-foreground shrink-0">
                  NOK {fmtNOK(p.totalNow)}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Stacked bar + Risk flags ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5">
        {/* Stacked status bar */}
        <div className="rounded-2xl bg-card shadow-sm p-4 sm:p-5">
          <h4 className="text-xs font-semibold text-foreground mb-3">Prosjekter per status</h4>
          {totalJobs > 0 ? (
            <>
              <div className="flex rounded-full overflow-hidden h-5 bg-muted/50">
                {statusCounts.map((s, i) => (
                  <div
                    key={i}
                    style={{ width: `${(s.value / totalJobs) * 100}%`, backgroundColor: s.color }}
                    className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                    title={`${s.name}: ${s.value}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                {statusCounts.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11px]">
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-muted-foreground">{s.name}</span>
                    <span className="font-medium text-foreground">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Ingen prosjekter</p>
          )}
        </div>

        {/* Top risk flags */}
        <div className="rounded-2xl bg-card shadow-sm p-4 sm:p-5">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-3">
            <AlertTriangle className="h-3.5 w-3.5" /> Topp 5 risikoflagg
          </h4>
          {riskFlags.length > 0 ? (
            <div className="space-y-1.5">
              {riskFlags.map((f, i) => (
                <div key={i} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: f.severity === "high" ? "hsl(0, 72%, 51%)" : "hsl(28, 80%, 52%)" }}
                  />
                  <span className="text-sm text-foreground flex-1 truncate">{f.label}</span>
                  <Badge variant="outline" className="text-[10px] rounded-full px-2 shrink-0">
                    {f.count} prosjekt{f.count !== 1 ? "er" : ""}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Ingen åpne risikoflagg</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Health count card ──

function HealthCountCard({ label, count, totalValue, color, active, onClick }: {
  label: string;
  count: number;
  totalValue: number;
  color: "destructive" | "accent" | "success";
  active: boolean;
  onClick: () => void;
}) {
  const borderClass = active
    ? color === "destructive" ? "ring-2 ring-destructive/40" : color === "accent" ? "ring-2 ring-accent/40" : "ring-2 ring-success/40"
    : "";
  const dotClass = color === "destructive" ? "bg-destructive" : color === "accent" ? "bg-accent" : "bg-success";

  return (
    <button
      onClick={onClick}
      className={`rounded-2xl bg-card shadow-sm p-4 text-left hover:shadow-md transition-all cursor-pointer ${borderClass}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-2xl sm:text-3xl font-bold text-foreground leading-none">{count}</p>
      <p className="text-[11px] text-muted-foreground mt-1">NOK {fmtNOK(totalValue)}</p>
    </button>
  );
}
