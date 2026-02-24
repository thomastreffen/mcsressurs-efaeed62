import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, startOfWeek, endOfWeek, differenceInDays, subDays } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Briefcase, CalendarDays, AlertTriangle, TrendingUp,
  ChevronRight, ArrowRight, Clock, ShieldAlert, Wallet,
  FileText, UserPlus, BarChart3,
} from "lucide-react";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import type { JobStatus } from "@/lib/job-status";
import { Badge } from "@/components/ui/badge";

// ── Types ──

interface TodayMetrics {
  activeProjects: number;
  meetingsToday: number;
  overdueFollowups: number;
  criticalRisks: number;
}

interface TodayDeltas {
  activeProjects: number | null;
  meetingsToday: number | null;
  overdueFollowups: number | null;
  criticalRisks: number | null;
}

interface MiniGauge {
  label: string;
  pct: number;
  value: string;
  status: "green" | "yellow" | "red";
  href: string;
}

interface WeekItem {
  id: string;
  label: string;
  sub: string;
  href: string;
}

interface ActionItem {
  label: string;
  count: number;
  severity: "critical" | "warning" | "info";
  href: string;
  urgency: "today" | "this_week" | "overdue";
}

interface TempoLine {
  label: string;
  value: number;
  suffix?: string;
}

// ── Mini donut ──

function MiniDonut({ pct, status, size = 72 }: { pct: number; status: "green" | "yellow" | "red"; size?: number }) {
  const sw = 8;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct / 100));
  const dash = clamped * circ;

  const color = status === "green" ? "hsl(152, 55%, 40%)"
    : status === "yellow" ? "hsl(38, 60%, 52%)"
    : "hsl(0, 50%, 58%)";
  const track = pct <= 0 ? "hsl(152, 20%, 85%)" : "hsl(210, 8%, 91%)";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={sw} />
      {pct > 0 && (
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-700 ease-out"
        />
      )}
    </svg>
  );
}

// ── Section header ──

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {action}
    </div>
  );
}

// ── Delta badge ──

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return null;
  const positive = delta > 0;
  return (
    <span className={`ml-1.5 text-[9px] font-mono font-medium rounded px-1 py-px ${
      positive ? "text-success bg-success/10" : "text-destructive bg-destructive/10"
    }`}>
      {positive ? "+" : ""}{delta}
    </span>
  );
}

// ── Tempo line ──

function TempoLineItem({ line }: { line: TempoLine }) {
  const isPositive = line.value > 0;
  const isNegative = line.value < 0;
  const arrow = isPositive ? "↑" : isNegative ? "↓" : "";
  const colorClass = isPositive ? "text-success" : isNegative ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{line.label}</span>
      <span className={`text-xs font-mono font-medium ${colorClass}`}>
        {arrow} {line.value === 0 ? "—" : `${Math.abs(line.value)}${line.suffix || ""}`}
      </span>
    </div>
  );
}

// ── Urgency label ──

function UrgencyLabel({ urgency }: { urgency: "today" | "this_week" | "overdue" }) {
  const map = {
    overdue: { text: "Forfalt", cls: "text-destructive bg-destructive/10" },
    today: { text: "I dag", cls: "text-foreground bg-secondary" },
    this_week: { text: "Denne uken", cls: "text-muted-foreground bg-secondary" },
  };
  const { text, cls } = map[urgency];
  return <span className={`text-[9px] font-medium rounded px-1.5 py-px ${cls}`}>{text}</span>;
}

// ── Main ──

export default function OverviewPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);

  const [today, setToday] = useState<TodayMetrics>({ activeProjects: 0, meetingsToday: 0, overdueFollowups: 0, criticalRisks: 0 });
  const [deltas, setDeltas] = useState<TodayDeltas>({ activeProjects: null, meetingsToday: null, overdueFollowups: null, criticalRisks: null });
  const [projectGauges, setProjectGauges] = useState<MiniGauge[]>([]);
  const [salesGauges, setSalesGauges] = useState<MiniGauge[]>([]);
  const [tempoLines, setTempoLines] = useState<TempoLine[]>([]);
  const [weekItems, setWeekItems] = useState<{ resources: { name: string; hours: number }[]; milestones: WeekItem[]; closings: WeekItem[] }>({ resources: [], milestones: [], closings: [] });
  const [actions, setActions] = useState<ActionItem[]>([]);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const now = new Date();
    const todayStart = startOfDay(now).toISOString();
    const todayEnd = new Date(startOfDay(now).getTime() + 86400000).toISOString();
    const yesterdayStart = subDays(startOfDay(now), 1).toISOString();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const d7 = subDays(now, 7);
    const d14 = subDays(now, 14);
    const d30 = subDays(now, 30);
    const d90 = subDays(now, 90);

    const [eventsRes, risksRes, leadsRes, offersRes, changeOrdersRes, techsRes, calLinksRes, calEventsRes] = await Promise.all([
      supabase.from("events").select("id, title, status, customer, start_time, end_time, meeting_join_url, internal_number, created_at, event_technicians(technician_id, technicians(name))").is("deleted_at", null),
      supabase.from("job_risk_items").select("id, job_id, severity, status, category, created_at"),
      supabase.from("leads").select("id, status, company_name, estimated_value, probability, next_action_date, updated_at, created_at, expected_close_date").is("deleted_at", null),
      supabase.from("offers").select("id, offer_number, status, total_inc_vat, sent_at, created_at, calculation_id, calculations(customer_name)").order("created_at", { ascending: false }),
      supabase.from("job_change_orders").select("id, job_id, status, amount_ex_vat"),
      supabase.from("technicians").select("id, name, user_id"),
      supabase.from("job_calendar_links").select("id, sync_status, user_id"),
      supabase.from("lead_calendar_links").select("id, lead_id, event_start, event_subject").gte("event_start", todayStart).lt("event_start", todayEnd),
    ]);

    const events = eventsRes.data || [];
    const risks = risksRes.data || [];
    const leads = leadsRes.data || [];
    const offers = offersRes.data || [];
    const changeOrders = changeOrdersRes.data || [];
    const techs = techsRes.data || [];

    const activeStatuses: JobStatus[] = ["requested", "approved", "scheduled", "in_progress", "time_change_proposed"];

    // ── SECTION 1: TODAY + DELTAS ──
    const activeProjects = events.filter((e: any) => activeStatuses.includes(e.status)).length;
    const meetingsToday = (calEventsRes.data || []).length;
    const openLeads = leads.filter(l => !["lost", "won"].includes(l.status));
    const overdueLeads = openLeads.filter(l => l.next_action_date && new Date(l.next_action_date) < now).length;
    const overdueOffers = offers.filter((o: any) => o.status === "sent" && o.sent_at && differenceInDays(now, new Date(o.sent_at)) > 5).length;
    const openRisks = risks.filter(r => r.status === "open");
    const criticalRisks = openRisks.filter(r => r.severity === "high").length;

    // Yesterday snapshot for deltas
    const yesterdayActive = events.filter((e: any) => activeStatuses.includes(e.status) && new Date(e.created_at) < new Date(yesterdayStart)).length;
    const yesterdayOverdueLeads = openLeads.filter(l => l.next_action_date && new Date(l.next_action_date) < new Date(yesterdayStart)).length;
    const yesterdayOverdueOffers = offers.filter((o: any) => o.status === "sent" && o.sent_at && differenceInDays(new Date(yesterdayStart), new Date(o.sent_at)) > 5).length;
    const yesterdayCritical = risks.filter(r => r.status === "open" && r.severity === "high" && new Date(r.created_at) < new Date(yesterdayStart)).length;

    const activeDelta = activeProjects - yesterdayActive;
    const overdueDelta = (overdueLeads + overdueOffers) - (yesterdayOverdueLeads + yesterdayOverdueOffers);
    const critDelta = criticalRisks - yesterdayCritical;

    setToday({ activeProjects, meetingsToday, overdueFollowups: overdueLeads + overdueOffers, criticalRisks });
    setDeltas({
      activeProjects: activeDelta !== 0 ? activeDelta : null,
      meetingsToday: null,
      overdueFollowups: overdueDelta !== 0 ? overdueDelta : null,
      criticalRisks: critDelta !== 0 ? critDelta : null,
    });

    // ── SECTION 2: COMPANY HEALTH ──
    const totalCO = changeOrders.length;
    const pendingCO = changeOrders.filter((c: any) => ["draft", "sent"].includes(c.status)).length;
    const pendingPct = totalCO > 0 ? Math.round((pendingCO / totalCO) * 100) : 0;

    const riskScore = openRisks.reduce((s, r) => s + (r.severity === "high" ? 2 : r.severity === "medium" ? 1 : 0), 0);
    const riskPct = Math.min(100, Math.round((riskScore / Math.max(1, 20)) * 100));
    const riskStatus: "green" | "yellow" | "red" = riskScore >= 9 ? "red" : riskScore >= 4 ? "yellow" : "green";

    const cashflowPct = 0;

    setProjectGauges([
      { label: "Økonomi", pct: pendingPct, value: `${pendingPct}%`, status: pendingPct > 15 ? "red" : pendingPct > 8 ? "yellow" : "green", href: "/projects" },
      { label: "Risiko", pct: riskPct, value: `${riskScore}p`, status: riskStatus, href: "/projects" },
      { label: "Cashflow", pct: cashflowPct, value: `${cashflowPct}%`, status: "green", href: "/projects" },
    ]);

    // Sales gauges
    let score = 50;
    const meetings14 = (calEventsRes.data || []).length;
    const offersSent14 = offers.filter((o: any) => o.status !== "draft" && new Date(o.created_at) >= d14).length;
    score += Math.min(meetings14 * 5, 20);
    score += Math.min(offersSent14 * 5, 20);
    const inactiveLeads = openLeads.filter(l => new Date(l.updated_at) < d7).length;
    if (inactiveLeads > 5) score -= 5;
    if (meetings14 === 0) score -= 10;
    score = Math.max(0, Math.min(100, score));
    const pulseStatus: "green" | "yellow" | "red" = score >= 70 ? "green" : score >= 50 ? "yellow" : "red";

    const pipelineValue = openLeads.reduce((s, l) => s + (Number(l.estimated_value || 0) * (Number(l.probability || 50) / 100)), 0);
    const quarterTarget = 2_000_000;
    const pipelinePct = Math.min(100, Math.round((pipelineValue / quarterTarget) * 100));
    const pipelineStatus: "green" | "yellow" | "red" = pipelinePct >= 100 ? "green" : pipelinePct >= 80 ? "yellow" : "red";

    const recentOffers90 = offers.filter((o: any) => new Date(o.created_at) >= d90);
    const sent90 = recentOffers90.filter((o: any) => o.status !== "draft").length;
    const won90 = recentOffers90.filter((o: any) => o.status === "accepted").length;
    const winRate = sent90 > 0 ? Math.round((won90 / sent90) * 100) : 0;
    const winStatus: "green" | "yellow" | "red" = winRate >= 35 ? "green" : winRate >= 20 ? "yellow" : "red";

    setSalesGauges([
      { label: "Salgspuls", pct: score, value: `${score}`, status: pulseStatus, href: "/sales" },
      { label: "Pipeline", pct: pipelinePct, value: `${pipelinePct}%`, status: pipelineStatus, href: "/sales" },
      { label: "Vinnrate", pct: winRate, value: `${winRate}%`, status: winStatus, href: "/sales" },
    ]);

    // ── TEMPO: BEVEGELSE SISTE 7 DAGER ──
    const newProjects7d = events.filter((e: any) => new Date(e.created_at) >= d7 && activeStatuses.includes(e.status)).length;
    const newLeads7d = leads.filter(l => new Date(l.created_at) >= d7).length;
    const offersSent7d = offers.filter((o: any) => o.status !== "draft" && o.sent_at && new Date(o.sent_at) >= d7).length;

    const highRisksNow = openRisks.filter(r => r.severity === "high").length;
    const highRisks7dAgo = risks.filter(r => r.status === "open" && r.severity === "high" && new Date(r.created_at) < d7).length;
    const highRiskDelta = highRisksNow - highRisks7dAgo;

    const pipelineNow = pipelineValue;
    const leadsOlderThan7d = leads.filter(l => !["lost", "won"].includes(l.status) && new Date(l.created_at) < d7);
    const pipeline7dAgo = leadsOlderThan7d.reduce((s, l) => s + (Number(l.estimated_value || 0) * (Number(l.probability || 50) / 100)), 0);
    const pipelineDeltaK = Math.round((pipelineNow - pipeline7dAgo) / 1000);

    setTempoLines([
      { label: "Nye prosjekter", value: newProjects7d },
      { label: "Nye leads", value: newLeads7d },
      { label: "Tilbud sendt", value: offersSent7d },
      { label: "Endring HIGH-risiko", value: highRiskDelta },
      { label: "Pipeline-endring", value: pipelineDeltaK, suffix: "k" },
    ]);

    // ── SECTION 3: THIS WEEK ──
    const thisWeekEvents = events.filter((e: any) => {
      const s = new Date(e.start_time);
      return s >= weekStart && s <= weekEnd && activeStatuses.includes(e.status);
    });
    const techHours = new Map<string, number>();
    for (const tech of techs) techHours.set(tech.name, 0);
    for (const ev of thisWeekEvents) {
      const hours = (new Date(ev.end_time).getTime() - new Date(ev.start_time).getTime()) / 3600000;
      for (const et of (ev as any).event_technicians || []) {
        const name = et.technicians?.name;
        if (name) techHours.set(name, (techHours.get(name) || 0) + hours);
      }
    }
    const resources = Array.from(techHours.entries())
      .map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }))
      .filter(r => r.hours > 0)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5);

    const closings = openLeads
      .filter(l => l.expected_close_date && new Date(l.expected_close_date) >= weekStart && new Date(l.expected_close_date) <= weekEnd)
      .slice(0, 5)
      .map(l => ({
        id: l.id,
        label: l.company_name,
        sub: `${fmtNOK(Number(l.estimated_value || 0))}`,
        href: `/sales/leads/${l.id}`,
      }));

    setWeekItems({ resources, milestones: [], closings });

    // ── SECTION 4: ACTION REQUIRED (with urgency) ──
    const actionList: ActionItem[] = [];

    const leadsInactive = openLeads.filter(l => new Date(l.updated_at) < d7).length;
    if (leadsInactive > 0) {
      const hasOld = openLeads.some(l => new Date(l.updated_at) < d14);
      actionList.push({ label: "Leads uten aktivitet > 7 dager", count: leadsInactive, severity: "warning", href: "/sales/leads", urgency: hasOld ? "overdue" : "this_week" });
    }

    if (criticalRisks > 0) actionList.push({ label: "Prosjekter med kritisk risiko", count: criticalRisks, severity: "critical", href: "/projects", urgency: "today" });

    if (overdueOffers > 0) {
      const hasVeryOld = offers.some((o: any) => o.status === "sent" && o.sent_at && differenceInDays(now, new Date(o.sent_at)) > 10);
      actionList.push({ label: "Tilbud uten oppfølging > 5 dager", count: overdueOffers, severity: "warning", href: "/sales/offers", urgency: hasVeryOld ? "overdue" : "this_week" });
    }

    const requestedJobs = events.filter((e: any) => e.status === "requested").length;
    if (requestedJobs > 0) actionList.push({ label: "Prosjekter uten godkjent plan", count: requestedJobs, severity: "warning", href: "/projects", urgency: "this_week" });

    if (overdueLeads > 0) {
      const hasOverdue = openLeads.some(l => l.next_action_date && differenceInDays(now, new Date(l.next_action_date)) > 3);
      actionList.push({ label: "Leads med forfalt oppfølging", count: overdueLeads, severity: "warning", href: "/sales/leads", urgency: hasOverdue ? "overdue" : "today" });
    }

    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const urgencyOrder = { overdue: 0, today: 1, this_week: 2 };
    actionList.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    setActions(actionList);
    setLoading(false);
  }

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 w-full pb-24 lg:pb-8 max-w-[1400px] mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-foreground">Oversikt</h1>
        <p className="text-xs text-muted-foreground">
          {format(new Date(), "EEEE d. MMMM", { locale: nb })} · Uke {format(new Date(), "w", { locale: nb })}
        </p>
      </div>

      {/* ── SECTION 1: I DAG ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TodayBlock
          icon={<Briefcase className="h-4 w-4" />}
          label="Aktive prosjekter"
          value={today.activeProjects}
          delta={deltas.activeProjects}
          onClick={() => navigate("/projects")}
        />
        <TodayBlock
          icon={<CalendarDays className="h-4 w-4" />}
          label="Møter i dag"
          value={today.meetingsToday}
          delta={deltas.meetingsToday}
          onClick={() => navigate("/sales/leads")}
        />
        <TodayBlock
          icon={<Clock className="h-4 w-4" />}
          label="Forfalte oppfølginger"
          value={today.overdueFollowups}
          delta={deltas.overdueFollowups}
          status={today.overdueFollowups > 0 ? "warning" : undefined}
          onClick={() => navigate("/sales/leads")}
        />
        <TodayBlock
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Kritiske risikoer"
          value={today.criticalRisks}
          delta={deltas.criticalRisks}
          status={today.criticalRisks > 0 ? "critical" : undefined}
          onClick={() => navigate("/projects")}
        />
      </div>

      {/* ── SECTION 2: SELSKAPETS HELSE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <div
          className="rounded-xl bg-card/60 border border-border/40 p-4 cursor-pointer hover:bg-card/80 transition-colors"
          onClick={() => navigate("/projects")}
        >
          <SectionHeader
            title="Prosjekthelse"
            action={<span className="text-xs text-muted-foreground flex items-center gap-1">Detaljer <ChevronRight className="h-3 w-3" /></span>}
          />
          <div className="flex items-center justify-around gap-2">
            {projectGauges.map(g => (
              <div key={g.label} className="flex flex-col items-center gap-1.5">
                <div className="relative">
                  <MiniDonut pct={g.pct} status={g.status} size={isMobile ? 60 : 72} />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold font-mono text-foreground">
                    {g.value}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{g.label}</span>
              </div>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div
            className="rounded-xl bg-card/60 border border-border/40 p-4 cursor-pointer hover:bg-card/80 transition-colors"
            onClick={() => navigate("/sales")}
          >
            <SectionHeader
              title="Salgshelse"
              action={<span className="text-xs text-muted-foreground flex items-center gap-1">Detaljer <ChevronRight className="h-3 w-3" /></span>}
            />
            <div className="flex items-center justify-around gap-2">
              {salesGauges.map(g => (
                <div key={g.label} className="flex flex-col items-center gap-1.5">
                  <div className="relative">
                    <MiniDonut pct={g.pct} status={g.status} size={isMobile ? 60 : 72} />
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold font-mono text-foreground">
                      {g.value}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{g.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── TEMPO: BEVEGELSE SISTE 7 DAGER ── */}
      {tempoLines.length > 0 && (
        <div className="rounded-xl bg-card/60 border border-border/40 p-4">
          <SectionHeader title="Bevegelse siste 7 dager" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0.5">
            {tempoLines.map(line => (
              <TempoLineItem key={line.label} line={line} />
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION 3: DENNE UKEN ── */}
      <div>
        <SectionHeader title="Denne uken" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Resource load */}
          <div className="rounded-xl bg-card/60 border border-border/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">Ressursbelastning</span>
              <button onClick={() => navigate("/projects/plan")} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                Plan <ArrowRight className="h-2.5 w-2.5" />
              </button>
            </div>
            {weekItems.resources.length > 0 ? (
              <div className="space-y-2">
                {weekItems.resources.map(r => (
                  <div key={r.name} className="flex items-center gap-2">
                    <span className="text-xs text-foreground w-20 truncate">{r.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/60 transition-all"
                        style={{ width: `${Math.min(100, (r.hours / 40) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">{r.hours}t</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60 text-center py-3">Ingen planlagte timer</p>
            )}
          </div>

          {/* Active projects */}
          <div className="rounded-xl bg-card/60 border border-border/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">Prosjekter i arbeid</span>
              <button onClick={() => navigate("/projects")} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                Alle <ArrowRight className="h-2.5 w-2.5" />
              </button>
            </div>
            <div className="flex items-center justify-center py-3">
              <span className="text-3xl font-bold font-mono text-foreground">{today.activeProjects}</span>
              <span className="text-xs text-muted-foreground ml-2">aktive</span>
            </div>
          </div>

          {/* Closings */}
          <div className="rounded-xl bg-card/60 border border-border/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">Forventet closing</span>
              <button onClick={() => navigate("/sales/pipeline")} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                Pipeline <ArrowRight className="h-2.5 w-2.5" />
              </button>
            </div>
            {weekItems.closings.length > 0 ? (
              <div className="space-y-1.5">
                {weekItems.closings.map(c => (
                  <button
                    key={c.id}
                    onClick={(e) => { e.stopPropagation(); navigate(c.href); }}
                    className="flex items-center justify-between w-full rounded-lg px-2 py-1.5 text-left hover:bg-secondary/50 transition-colors"
                  >
                    <span className="text-xs text-foreground truncate">{c.label}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{c.sub}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60 text-center py-3">Ingen denne uken</p>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION 4: KREVER HANDLING ── */}
      {actions.length > 0 && (
        <div>
          <SectionHeader title="Krever handling" />
          <div className="space-y-1">
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={() => navigate(a.href)}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left hover:bg-secondary/50 transition-colors group"
              >
                <span className={`h-2 w-2 rounded-full shrink-0 ${
                  a.severity === "critical" ? "bg-destructive" : a.severity === "warning" ? "bg-accent" : "bg-muted-foreground"
                }`} />
                <span className="text-sm text-foreground flex-1">{a.label}</span>
                <UrgencyLabel urgency={a.urgency} />
                <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                  {a.count}
                </Badge>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Today block ──

function TodayBlock({ icon, label, value, delta, status, onClick }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  delta?: number | null;
  status?: "warning" | "critical";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl bg-card/60 border border-border/40 px-3 py-3 text-left hover:bg-card/80 transition-colors group min-h-[60px]"
    >
      <div className={`shrink-0 ${
        status === "critical" ? "text-destructive" : status === "warning" ? "text-accent" : "text-muted-foreground"
      }`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline">
          <p className="text-lg font-bold font-mono text-foreground leading-none">{value}</p>
          <DeltaBadge delta={delta ?? null} />
        </div>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{label}</p>
      </div>
      {status && (
        <span className={`ml-auto h-1.5 w-1.5 rounded-full shrink-0 ${
          status === "critical" ? "bg-destructive" : "bg-accent"
        }`} />
      )}
    </button>
  );
}

// ── Helpers ──

function fmtNOK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
  return n.toLocaleString("nb-NO");
}
