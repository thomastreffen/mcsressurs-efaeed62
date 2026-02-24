import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveLeads } from "@/lib/lead-queries";
import { calculateCompanyPulse, calculateActionPriority, getProjectHealthMicro, type CompanyPulse, type ProjectHealthMicro } from "@/lib/company-pulse";
import { format, startOfDay, startOfWeek, endOfWeek, differenceInDays, subDays, formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Briefcase, CalendarDays, AlertTriangle, TrendingUp,
  ChevronRight, ArrowRight, Clock, ShieldAlert, Wallet,
  FileText, UserPlus, BarChart3, Zap, Mail, Activity,
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

interface TodayContext {
  nextMeetingTime: string | null;
  overdueCount: number;
  todayCount: number;
  riskDelta7d: number;
}

interface MiniGauge {
  label: string;
  pct: number;
  value: string;
  status: "green" | "yellow" | "red";
  href: string;
  micro?: string;
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
  module: string;
  owner?: string;
  priorityScore: number;
}

interface TempoLine {
  label: string;
  value: number;
  suffix?: string;
}

interface ActivityFeedItem {
  id: string;
  type: "lead" | "offer" | "project" | "system";
  description: string;
  created_at: string;
  href: string;
}

interface ProjectTempoLine {
  label: string;
  value: number;
}

// ── Large Donut Chart ──

function LargeDonut({ segments, size = 200 }: { segments: { pct: number; color: string; label: string }[]; size?: number }) {
  const sw = 32;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;

  let offset = 0;
  const rings = segments.map((seg, i) => {
    const dash = (seg.pct / 100) * circ;
    const ring = (
      <circle
        key={i}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={seg.color}
        strokeWidth={sw}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-700 ease-out"
      />
    );
    offset += dash;
    return ring;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={sw} opacity={0.3} />
      {rings}
    </svg>
  );
}

// ── Mini Donut for gauges ──

function MiniDonut({ pct, status, size = 80 }: { pct: number; status: "green" | "yellow" | "red"; size?: number }) {
  const sw = 6;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct / 100));
  const dash = clamped * circ;

  const color = status === "green" ? "hsl(var(--success))"
    : status === "yellow" ? "hsl(var(--accent))"
    : "hsl(var(--destructive))";
  const track = pct <= 0 ? "hsl(var(--success) / 0.2)" : "hsl(var(--border) / 0.4)";

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
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-foreground tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

// ── Activity type icon ──

function ActivityIcon({ type }: { type: ActivityFeedItem["type"] }) {
  const cls = "h-4 w-4";
  switch (type) {
    case "lead": return <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10"><UserPlus className={`${cls} text-primary`} /></div>;
    case "offer": return <div className="flex items-center justify-center h-8 w-8 rounded-full bg-accent/10"><FileText className={`${cls} text-accent`} /></div>;
    case "project": return <div className="flex items-center justify-center h-8 w-8 rounded-full bg-destructive/10"><ShieldAlert className={`${cls} text-destructive`} /></div>;
    case "system": return <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted"><Zap className={`${cls} text-muted-foreground`} /></div>;
  }
}

// ── Urgency badge ──

function UrgencyBadge({ urgency }: { urgency: "today" | "this_week" | "overdue" }) {
  const map = {
    overdue: { text: "Forfalt", cls: "bg-destructive/10 text-destructive" },
    today: { text: "I dag", cls: "bg-primary/10 text-primary" },
    this_week: { text: "Denne uken", cls: "bg-muted text-muted-foreground" },
  };
  const { text, cls } = map[urgency];
  return <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${cls}`}>{text}</span>;
}

// ── Pulse stripe ──

function PulseStripe({ pulse }: { pulse: CompanyPulse }) {
  const dotColor = pulse.level === "stable" ? "bg-success"
    : pulse.level === "elevated" ? "bg-accent"
    : "bg-destructive";

  return (
    <div className="flex items-center gap-3 rounded-xl bg-card border border-border/40 px-4 py-3 mt-4">
      <span className={`h-3 w-3 rounded-full ${dotColor} shrink-0 animate-pulse`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{pulse.statusLabel}</p>
        <p className="text-xs text-muted-foreground/70 mt-0.5">{pulse.explanation}</p>
      </div>
    </div>
  );
}

// ── KPI Card ──

function KpiCard({ icon, label, value, delta, subline, status, onClick, gradient }: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  delta?: number | null;
  subline?: string;
  status?: "warning" | "critical";
  onClick: () => void;
  gradient?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center justify-center rounded-2xl bg-card border border-border/40 p-5 text-center hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 group overflow-hidden min-h-[140px]"
    >
      {/* Subtle gradient top stripe */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${gradient || "bg-primary/30"}`} />

      {/* Icon */}
      <div className={`mb-2 ${
        status === "critical" ? "text-destructive" : status === "warning" ? "text-accent" : "text-primary/60"
      }`}>
        {icon}
      </div>

      {/* Big number */}
      <p className="text-4xl font-bold font-mono text-primary tracking-tight leading-none">{value}</p>

      {/* Delta */}
      {delta !== null && delta !== undefined && delta !== 0 && (
        <span className={`mt-1 text-[10px] font-mono font-medium rounded-full px-2 py-0.5 ${
          delta > 0 ? "text-success bg-success/10" : "text-destructive bg-destructive/10"
        }`}>
          {delta > 0 ? "+" : ""}{delta}
        </span>
      )}

      {/* Label */}
      <p className="text-xs text-muted-foreground mt-2 font-medium">{label}</p>

      {/* Subline */}
      {subline && (
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{subline}</p>
      )}

      {/* Status indicator */}
      {status && (
        <span className={`absolute top-3 right-3 h-2 w-2 rounded-full ${
          status === "critical" ? "bg-destructive animate-pulse" : "bg-accent"
        }`} />
      )}
    </button>
  );
}

// ── Main ──

export default function OverviewPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);

  const [today, setToday] = useState<TodayMetrics>({ activeProjects: 0, meetingsToday: 0, overdueFollowups: 0, criticalRisks: 0 });
  const [deltas, setDeltas] = useState<TodayDeltas>({ activeProjects: null, meetingsToday: null, overdueFollowups: null, criticalRisks: null });
  const [todayCtx, setTodayCtx] = useState<TodayContext>({ nextMeetingTime: null, overdueCount: 0, todayCount: 0, riskDelta7d: 0 });
  const [projectGauges, setProjectGauges] = useState<MiniGauge[]>([]);
  const [salesGauges, setSalesGauges] = useState<MiniGauge[]>([]);
  const [tempoLines, setTempoLines] = useState<TempoLine[]>([]);
  const [projectTempo, setProjectTempo] = useState<ProjectTempoLine[]>([]);
  const [weekItems, setWeekItems] = useState<{ resources: { name: string; hours: number }[]; milestones: WeekItem[]; closings: WeekItem[] }>({ resources: [], milestones: [], closings: [] });
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([]);
  const [pulse, setPulse] = useState<CompanyPulse | null>(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const now = new Date();
    const todayStart = startOfDay(now).toISOString();
    const todayEnd = new Date(startOfDay(now).getTime() + 86400000).toISOString();
    const yesterdayStart = subDays(startOfDay(now), 1).toISOString();
    const h24 = subDays(now, 1).toISOString();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const d7 = subDays(now, 7);
    const d14 = subDays(now, 14);
    const d30 = subDays(now, 30);
    const d90 = subDays(now, 90);

    const leadsRes = await fetchActiveLeads("id, status, company_name, estimated_value, probability, next_action_date, updated_at, created_at, expected_close_date, assigned_owner_user_id");

    const [eventsRes, risksRes, offersRes, changeOrdersRes, techsRes, calLinksRes, calEventsRes, calcsRes, activityRes] = await Promise.all([
      supabase.from("events").select("id, title, status, customer, start_time, end_time, meeting_join_url, internal_number, created_at, event_technicians(technician_id, technicians(name))").is("deleted_at", null),
      supabase.from("job_risk_items").select("id, job_id, severity, status, category, created_at, updated_at"),
      supabase.from("offers").select("id, offer_number, status, total_inc_vat, sent_at, created_at, calculation_id, lead_id, calculations(customer_name, project_title)").order("created_at", { ascending: false }),
      supabase.from("job_change_orders").select("id, job_id, status, amount_ex_vat"),
      supabase.from("technicians").select("id, name, user_id"),
      supabase.from("job_calendar_links").select("id, sync_status, user_id, last_error"),
      supabase.from("lead_calendar_links").select("id, lead_id, event_start, event_subject, event_end").gte("event_start", todayStart).lt("event_start", todayEnd).order("event_start", { ascending: true }),
      supabase.from("calculations").select("id, project_title, customer_name, created_at, status, lead_id").is("deleted_at", null).gte("created_at", h24),
      supabase.from("activity_log").select("id, entity_type, entity_id, action, title, created_at").gte("created_at", h24).order("created_at", { ascending: false }).limit(20),
    ]);

    const events = eventsRes.data || [];
    const risks = risksRes.data || [];
    const leads = leadsRes.data;
    const offers = offersRes.data || [];
    const changeOrders = changeOrdersRes.data || [];
    const techs = techsRes.data || [];
    const calEvents = calEventsRes.data || [];
    const calcs24 = calcsRes.data || [];
    const activities24 = activityRes.data || [];

    const activeStatuses: JobStatus[] = ["requested", "approved", "scheduled", "in_progress", "time_change_proposed"];

    const activeProjects = events.filter((e: any) => activeStatuses.includes(e.status)).length;
    const meetingsToday = calEvents.length;
    const openLeads = leads.filter(l => !["lost", "won"].includes(l.status));
    const overdueLeads = openLeads.filter(l => l.next_action_date && new Date(l.next_action_date) < now);
    const todayActionLeads = openLeads.filter(l => l.next_action_date && new Date(l.next_action_date) >= startOfDay(now) && new Date(l.next_action_date) < new Date(startOfDay(now).getTime() + 86400000));
    const overdueOffers = offers.filter((o: any) => o.status === "sent" && o.sent_at && differenceInDays(now, new Date(o.sent_at)) > 5).length;
    const openRisks = risks.filter(r => r.status === "open");
    const criticalRisks = openRisks.filter(r => r.severity === "high").length;

    const yesterdayActive = events.filter((e: any) => activeStatuses.includes(e.status) && new Date(e.created_at) < new Date(yesterdayStart)).length;
    const yesterdayOverdueLeads = openLeads.filter(l => l.next_action_date && new Date(l.next_action_date) < new Date(yesterdayStart)).length;
    const yesterdayOverdueOffers = offers.filter((o: any) => o.status === "sent" && o.sent_at && differenceInDays(new Date(yesterdayStart), new Date(o.sent_at)) > 5).length;
    const yesterdayCritical = risks.filter(r => r.status === "open" && r.severity === "high" && new Date(r.created_at) < new Date(yesterdayStart)).length;

    const activeDelta = activeProjects - yesterdayActive;
    const overdueDelta = (overdueLeads.length + overdueOffers) - (yesterdayOverdueLeads + yesterdayOverdueOffers);
    const critDelta = criticalRisks - yesterdayCritical;

    const highRisksNow = openRisks.filter(r => r.severity === "high").length;
    const highRisks7dAgo = risks.filter(r => r.status === "open" && r.severity === "high" && new Date(r.created_at) < d7).length;
    const riskDelta7d = highRisksNow - highRisks7dAgo;

    const nextMeeting = calEvents.find(m => new Date(m.event_start!) >= now);
    const nextMeetingTime = nextMeeting?.event_start ? format(new Date(nextMeeting.event_start), "HH:mm") : null;

    setToday({ activeProjects, meetingsToday, overdueFollowups: overdueLeads.length + overdueOffers, criticalRisks });
    setDeltas({
      activeProjects: activeDelta !== 0 ? activeDelta : null,
      meetingsToday: null,
      overdueFollowups: overdueDelta !== 0 ? overdueDelta : null,
      criticalRisks: critDelta !== 0 ? critDelta : null,
    });
    setTodayCtx({ nextMeetingTime, overdueCount: overdueLeads.length, todayCount: todayActionLeads.length, riskDelta7d });

    // ── SECTION 2: COMPANY HEALTH ──
    const totalCO = changeOrders.length;
    const pendingCO = changeOrders.filter((c: any) => ["draft", "sent"].includes(c.status)).length;
    const pendingPct = totalCO > 0 ? Math.round((pendingCO / totalCO) * 100) : 0;

    const riskScore = openRisks.reduce((s, r) => s + (r.severity === "high" ? 2 : r.severity === "medium" ? 1 : 0), 0);
    const riskPct = Math.min(100, Math.round((riskScore / Math.max(1, 20)) * 100));
    const riskStatus: "green" | "yellow" | "red" = riskScore >= 9 ? "red" : riskScore >= 4 ? "yellow" : "green";

    const mediumRiskCount = openRisks.filter(r => r.severity === "medium").length;
    const cashflowPct = 0;

    const budgetOverCount = changeOrders.filter((c: any) => c.status === "sent" && Number(c.amount_ex_vat || 0) > 0).length;

    const healthMicro = getProjectHealthMicro({
      budgetOverCount,
      highRiskCount: criticalRisks,
      mediumRiskCount,
      overdueInvoices: 0,
      oldestInvoiceDays: 0,
    });

    setProjectGauges([
      { label: "Økonomi", pct: pendingPct, value: `${pendingPct}%`, status: pendingPct > 15 ? "red" : pendingPct > 8 ? "yellow" : "green", href: "/projects", micro: healthMicro.econ },
      { label: "Risiko", pct: riskPct, value: `${riskScore}p`, status: riskStatus, href: "/projects", micro: healthMicro.risk },
      { label: "Cashflow", pct: cashflowPct, value: `${cashflowPct}%`, status: "green", href: "/projects", micro: healthMicro.cashflow },
    ]);

    // Sales gauges
    let score = 50;
    const meetings14 = calEvents.length;
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

    // ── TEMPO ──
    const newProjects7d = events.filter((e: any) => new Date(e.created_at) >= d7 && activeStatuses.includes(e.status)).length;
    const newLeads7d = leads.filter(l => new Date(l.created_at) >= d7).length;
    const offersSent7d = offers.filter((o: any) => o.status !== "draft" && o.sent_at && new Date(o.sent_at) >= d7).length;

    const pipelineNow = pipelineValue;
    const leadsOlderThan7d = leads.filter(l => !["lost", "won"].includes(l.status) && new Date(l.created_at) < d7);
    const pipeline7dAgo = leadsOlderThan7d.reduce((s, l) => s + (Number(l.estimated_value || 0) * (Number(l.probability || 50) / 100)), 0);
    const pipelineDeltaK = Math.round((pipelineNow - pipeline7dAgo) / 1000);

    setTempoLines([
      { label: "Nye prosjekter", value: newProjects7d },
      { label: "Nye leads", value: newLeads7d },
      { label: "Tilbud sendt", value: offersSent7d },
      { label: "Endring HIGH-risiko", value: riskDelta7d },
      { label: "Pipeline-endring", value: pipelineDeltaK, suffix: "k" },
    ]);

    // ── PROJECT TEMPO ──
    const riskChanges7d = risks.filter(r => new Date(r.updated_at || r.created_at) >= d7).length;
    const budgetChanges7d = changeOrders.filter((c: any) => new Date(c.created_at || "") >= d7).length;
    const plansApproved7d = events.filter((e: any) => e.status === "approved" && new Date(e.updated_at || e.created_at) >= d7).length;
    setProjectTempo([
      { label: "Nye prosjekter", value: newProjects7d },
      { label: "Endret risikonivå", value: riskChanges7d },
      { label: "Budsjett-endringer", value: budgetChanges7d },
      { label: "Planer godkjent", value: plansApproved7d },
    ]);

    // ── WEEK ──
    const weekEvts = events.filter((e: any) => {
      const s = new Date(e.start_time);
      return s >= weekStart && s <= weekEnd && activeStatuses.includes(e.status);
    });

    const techHoursMap: Record<string, number> = {};
    for (const e of weekEvts) {
      const hours = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 3600000;
      const techNames = (e as any).event_technicians?.map((et: any) => et.technicians?.name).filter(Boolean) || [];
      for (const name of techNames) {
        techHoursMap[name] = (techHoursMap[name] || 0) + hours;
      }
    }
    const resources = Object.entries(techHoursMap).map(([name, hours]) => ({ name, hours: Math.round(hours) })).sort((a, b) => b.hours - a.hours).slice(0, 5);

    const closingLeads = openLeads.filter(l => {
      if (!l.expected_close_date) return false;
      const d = new Date(l.expected_close_date);
      return d >= weekStart && d <= weekEnd;
    });
    const closings = closingLeads.map(l => ({
      id: l.id,
      label: l.company_name,
      sub: l.estimated_value ? fmtNOK(Number(l.estimated_value)) : "—",
      href: `/sales/leads/${l.id}`,
    }));

    setWeekItems({ resources, milestones: [], closings });

    // ── ACTIONS ──
    const actionList: ActionItem[] = [];
    
    if (overdueLeads.length > 0) {
      actionList.push({
        label: "Leads med forfalt oppfølging", count: overdueLeads.length, severity: "critical", href: "/sales/leads",
        urgency: "overdue", module: "Salg",
        priorityScore: calculateActionPriority({ urgency: "overdue" }),
      });
    }
    if (todayActionLeads.length > 0) {
      actionList.push({
        label: "Leads som krever handling i dag", count: todayActionLeads.length, severity: "warning", href: "/sales/leads",
        urgency: "today", module: "Salg",
        priorityScore: calculateActionPriority({ urgency: "today" }),
      });
    }
    if (overdueOffers > 0) {
      actionList.push({
        label: "Tilbud uten svar >5 dager", count: overdueOffers, severity: "warning", href: "/sales/offers",
        urgency: "overdue", module: "Salg",
        priorityScore: calculateActionPriority({ urgency: "overdue" }),
      });
    }
    if (criticalRisks > 0) {
      actionList.push({
        label: "Prosjekter med kritisk risiko", count: criticalRisks, severity: "critical", href: "/projects",
        urgency: "today", module: "Prosjekt",
        priorityScore: calculateActionPriority({ urgency: "today", isHighRisk: true }),
      });
    }

    const requestedJobs = events.filter((e: any) => e.status === "requested").length;
    if (requestedJobs > 0) {
      actionList.push({
        label: "Jobber som venter på planlegging", count: requestedJobs, severity: "warning", href: "/projects",
        urgency: "this_week", module: "Prosjekt",
        priorityScore: calculateActionPriority({ urgency: "this_week" }),
      });
    }

    const calcsNoOffer = (calcsRes.data || []).filter((c: any) => {
      const hasOffer = offers.some((o: any) => o.calculation_id === c.id);
      return !hasOffer && c.status === "draft";
    });
    if (calcsNoOffer.length > 0) {
      actionList.push({
        label: "Kalkyler uten tilbud", count: calcsNoOffer.length, severity: "info", href: "/sales/calculations",
        urgency: "this_week", module: "Salg",
        priorityScore: calculateActionPriority({ urgency: "this_week" }),
      });
    }

    const syncErrors = (calLinksRes.data || []).filter(l => l.sync_status === "error");
    if (syncErrors.length > 0) {
      actionList.push({
        label: "Synkroniseringsfeil", count: syncErrors.length, severity: "critical", href: "/admin/integration-health",
        urgency: "today", module: "System",
        priorityScore: calculateActionPriority({ urgency: "today", isSyncError: true }),
      });
    }

    actionList.sort((a, b) => b.priorityScore - a.priorityScore);
    setActions(actionList);

    // ── COMPANY PULSE ──
    const pipelineMomentumNegative = pipelineDeltaK < 0;
    const companyPulse = calculateCompanyPulse({
      overdueFollowups: overdueLeads.length,
      highRiskProjects: criticalRisks,
      calcsWithoutOffer: calcsNoOffer.length,
      syncErrors: syncErrors.length,
      pipelineMomentumNegative,
      projectsWithoutPlan: requestedJobs,
    });
    setPulse(companyPulse);

    // ── ACTIVITY FEED ──
    const feed: ActivityFeedItem[] = [];

    const newLeads24h = leads.filter(l => new Date(l.created_at) >= new Date(h24));
    for (const l of newLeads24h.slice(0, 5)) {
      feed.push({ id: `lead-${l.id}`, type: "lead", description: `Ny lead: ${l.company_name}`, created_at: l.created_at, href: `/sales/leads/${l.id}` });
    }

    for (const a of activities24.filter((a: any) => a.entity_type === "lead" && a.action === "status_change").slice(0, 5)) {
      feed.push({ id: `act-${a.id}`, type: "lead", description: a.title || `Statusendring: ${a.action}`, created_at: a.created_at, href: `/sales/leads/${a.entity_id}` });
    }

    for (const c of calcs24.slice(0, 3)) {
      feed.push({ id: `calc-${c.id}`, type: "offer", description: `Ny kalkyle: ${c.project_title}`, created_at: c.created_at, href: `/sales/calculations/${c.id}` });
    }

    const offers24h = offers.filter((o: any) => new Date(o.created_at) >= new Date(h24));
    for (const o of offers24h.slice(0, 3)) {
      feed.push({ id: `offer-${o.id}`, type: "offer", description: `Nytt tilbud: ${o.offer_number}`, created_at: o.created_at, href: `/sales/offers` });
    }

    const riskChanges24h = risks.filter(r => new Date(r.updated_at || r.created_at) >= new Date(h24) && r.severity === "high");
    for (const r of riskChanges24h.slice(0, 3)) {
      feed.push({ id: `risk-${r.id}`, type: "project", description: `Risiko (HIGH): ${r.category}`, created_at: r.updated_at || r.created_at, href: `/projects/${r.job_id}?tab=risiko` });
    }

    for (const s of syncErrors.slice(0, 2)) {
      feed.push({ id: `sync-${s.id}`, type: "system", description: `Synkfeil: ${s.last_error || "Kalendersynk feilet"}`, created_at: new Date().toISOString(), href: `/admin/integration-health` });
    }

    feed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setActivityFeed(feed.slice(0, 10));

    setLoading(false);
  }

  if (loading) return <DashboardSkeleton />;

  // ── Health donut segments ──
  const healthSegments = [
    ...projectGauges.map(g => ({
      pct: Math.max(g.pct, 3),
      color: g.status === "green" ? "hsl(var(--success))" : g.status === "yellow" ? "hsl(var(--accent))" : "hsl(var(--destructive))",
      label: g.label,
    })),
    ...salesGauges.map(g => ({
      pct: Math.max(g.pct * 0.3, 3),
      color: g.status === "green" ? "hsl(152, 55%, 50%)" : g.status === "yellow" ? "hsl(38, 70%, 55%)" : "hsl(0, 60%, 55%)",
      label: g.label,
    })),
  ];

  // Normalize to 100%
  const totalPct = healthSegments.reduce((s, seg) => s + seg.pct, 0);
  const normalizedSegments = healthSegments.map(seg => ({ ...seg, pct: (seg.pct / Math.max(totalPct, 1)) * 100 }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full pb-24 lg:pb-8 max-w-[1440px] mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Oversikt</h1>
        <p className="text-sm text-muted-foreground/70 mt-1">
          {format(new Date(), "EEEE d. MMMM yyyy", { locale: nb })} · Uke {format(new Date(), "w", { locale: nb })}
        </p>
        {pulse && <PulseStripe pulse={pulse} />}
      </div>

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Briefcase className="h-5 w-5" />}
          label="Prosjekter"
          value={today.activeProjects}
          delta={deltas.activeProjects}
          onClick={() => navigate("/projects")}
          gradient="bg-gradient-to-r from-primary/40 to-primary/10"
        />
        <KpiCard
          icon={<CalendarDays className="h-5 w-5" />}
          label="Møter i dag"
          value={today.meetingsToday}
          delta={deltas.meetingsToday}
          subline={todayCtx.nextMeetingTime ? `Neste kl ${todayCtx.nextMeetingTime}` : undefined}
          onClick={() => navigate("/sales/leads")}
          gradient="bg-gradient-to-r from-info/40 to-info/10"
        />
        <KpiCard
          icon={<Clock className="h-5 w-5" />}
          label="Oppfølginger"
          value={today.overdueFollowups}
          delta={deltas.overdueFollowups}
          subline={todayCtx.overdueCount > 0 ? `${todayCtx.overdueCount} forfalt` : undefined}
          status={today.overdueFollowups > 0 ? "warning" : undefined}
          onClick={() => navigate("/sales/leads")}
          gradient="bg-gradient-to-r from-accent/40 to-accent/10"
        />
        <KpiCard
          icon={<ShieldAlert className="h-5 w-5" />}
          label="Kritiske risikoer"
          value={today.criticalRisks}
          delta={deltas.criticalRisks}
          subline={todayCtx.riskDelta7d !== 0 ? `${todayCtx.riskDelta7d > 0 ? "+" : ""}${todayCtx.riskDelta7d} siste 7d` : undefined}
          status={today.criticalRisks > 0 ? "critical" : undefined}
          onClick={() => navigate("/projects")}
          gradient="bg-gradient-to-r from-destructive/30 to-destructive/5"
        />
      </div>

      {/* ── HEALTH + ACTIVITY DONUT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Health card */}
        <div
          className="lg:col-span-4 rounded-2xl bg-card border border-border/40 p-5 cursor-pointer hover:shadow-md transition-all duration-200"
          onClick={() => navigate("/projects")}
        >
          <SectionHeader
            title="Helse"
            action={<span className="text-xs text-muted-foreground/70 flex items-center gap-1 hover:text-foreground transition-colors">Prosjekt & Salg <ChevronRight className="h-3.5 w-3.5" /></span>}
          />
          <div className="flex gap-5 flex-wrap">
            {[...projectGauges, ...salesGauges].map(g => (
              <div key={g.label} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${
                  g.status === "green" ? "bg-success" : g.status === "yellow" ? "bg-accent" : "bg-destructive"
                }`} />
                <span className="text-xs text-muted-foreground">{g.label}</span>
              </div>
            ))}
          </div>

          {/* Mini gauges */}
          <div className="flex items-center justify-around mt-5">
            {projectGauges.map(g => (
              <div key={g.label} className="flex flex-col items-center gap-1">
                <div className="relative">
                  <MiniDonut pct={g.pct} status={g.status} size={isMobile ? 56 : 68} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold font-mono text-foreground">
                    {g.value}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">{g.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Donut card */}
        <div
          className="lg:col-span-4 rounded-2xl bg-card border border-border/40 p-5 cursor-pointer hover:shadow-md transition-all duration-200"
          onClick={() => navigate("/sales")}
        >
          <SectionHeader
            title="Aktivitet"
            action={<span className="text-xs text-muted-foreground/70 flex items-center gap-1 hover:text-foreground transition-colors">Siste 7 dager <ChevronRight className="h-3.5 w-3.5" /></span>}
          />
          <div className="flex items-center justify-center my-2">
            <LargeDonut segments={normalizedSegments} size={isMobile ? 160 : 190} />
          </div>
          {/* Sales gauges row */}
          <div className="flex items-center justify-around mt-3">
            {salesGauges.map(g => (
              <div key={g.label} className="text-center">
                <p className="text-lg font-bold font-mono text-foreground">{g.value}</p>
                <p className="text-[10px] text-muted-foreground">{g.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Actions panel */}
        <div className="lg:col-span-4 rounded-2xl bg-card border border-border/40 p-5">
          <SectionHeader title="Krever handling" />
          {actions.length > 0 ? (
            <div className="space-y-1">
              {actions.slice(0, 6).map((a, i) => (
                <button
                  key={i}
                  onClick={() => navigate(a.href)}
                  className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-left hover:bg-secondary/50 transition-colors group"
                >
                  <div className={`flex items-center justify-center h-8 w-8 rounded-full shrink-0 ${
                    a.severity === "critical" ? "bg-destructive/10" : a.severity === "warning" ? "bg-accent/10" : "bg-muted"
                  }`}>
                    <span className={`h-2 w-2 rounded-full ${
                      a.severity === "critical" ? "bg-destructive" : a.severity === "warning" ? "bg-accent" : "bg-muted-foreground"
                    }`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{a.label}</p>
                    <p className="text-[10px] text-muted-foreground">{a.module}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-mono rounded-full px-2">
                    {a.count}
                  </Badge>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center mb-2">
                <Activity className="h-5 w-5 text-success" />
              </div>
              <p className="text-sm font-medium text-foreground">Alt i balanse</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">Ingen kritiske oppgaver</p>
            </div>
          )}
        </div>
      </div>

      {/* ── ACTIVITY TIMELINE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Activity feed */}
        <div className="rounded-2xl bg-card border border-border/40 p-5">
          <SectionHeader
            title="Aktivitet siste 24 timer"
            action={<span className="text-xs text-muted-foreground/70">Siste hendelser</span>}
          />
          {activityFeed.length > 0 ? (
            <div className="space-y-1">
              {activityFeed.map(item => (
                <button
                  key={item.id}
                  onClick={() => navigate(item.href)}
                  className="flex items-center gap-3 w-full rounded-xl px-2 py-2 text-left hover:bg-secondary/50 transition-colors group"
                >
                  <ActivityIcon type={item.type} />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs text-foreground truncate block">{item.description}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: nb })}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 py-6 text-center">Ingen ny aktivitet siste 24 timer</p>
          )}
        </div>

        {/* Tempo + Week summary */}
        <div className="rounded-2xl bg-card border border-border/40 p-5">
          <SectionHeader title="Bevegelse siste 7 dager" />
          <div className="space-y-2.5">
            {tempoLines.map(line => {
              const isPositive = line.value > 0;
              const isNegative = line.value < 0;
              const arrow = isPositive ? "↑" : isNegative ? "↓" : "";
              const colorClass = isPositive ? "text-success" : isNegative ? "text-destructive" : "text-muted-foreground";
              return (
                <div key={line.label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{line.label}</span>
                  <span className={`text-sm font-mono font-semibold ${colorClass}`}>
                    {line.value === 0 ? "—" : `${arrow} ${Math.abs(line.value)}${line.suffix || ""}`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Resource utilization */}
          {weekItems.resources.length > 0 && (
            <div className="mt-5 pt-4 border-t border-border/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground">Ressursbelastning denne uken</span>
                <button onClick={() => navigate("/projects/plan")} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                  Plan <ArrowRight className="h-2.5 w-2.5" />
                </button>
              </div>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──

function fmtNOK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
  return n.toLocaleString("nb-NO");
}
