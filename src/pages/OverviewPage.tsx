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

// ── Activity type icon ──

function ActivityIcon({ type }: { type: ActivityFeedItem["type"] }) {
  const cls = "h-3.5 w-3.5";
  switch (type) {
    case "lead": return <UserPlus className={`${cls} text-primary`} />;
    case "offer": return <FileText className={`${cls} text-accent`} />;
    case "project": return <ShieldAlert className={`${cls} text-destructive`} />;
    case "system": return <Zap className={`${cls} text-muted-foreground`} />;
  }
}

// ── Pulse stripe ──

function PulseStripe({ pulse }: { pulse: CompanyPulse }) {
  const dotColor = pulse.level === "stable" ? "bg-success"
    : pulse.level === "elevated" ? "bg-accent"
    : "bg-destructive";

  return (
    <div className="flex items-start gap-2.5 py-2">
      <span className={`h-2.5 w-2.5 rounded-full ${dotColor} mt-0.5 shrink-0`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight">{pulse.statusLabel}</p>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{pulse.explanation}</p>
      </div>
    </div>
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

    // ── SECTION 1: TODAY + DELTAS + CONTEXT ──
    const activeProjects = events.filter((e: any) => activeStatuses.includes(e.status)).length;
    const meetingsToday = calEvents.length;
    const openLeads = leads.filter(l => !["lost", "won"].includes(l.status));
    const overdueLeads = openLeads.filter(l => l.next_action_date && new Date(l.next_action_date) < now);
    const todayActionLeads = openLeads.filter(l => l.next_action_date && new Date(l.next_action_date) >= startOfDay(now) && new Date(l.next_action_date) < new Date(startOfDay(now).getTime() + 86400000));
    const overdueOffers = offers.filter((o: any) => o.status === "sent" && o.sent_at && differenceInDays(now, new Date(o.sent_at)) > 5).length;
    const openRisks = risks.filter(r => r.status === "open");
    const criticalRisks = openRisks.filter(r => r.severity === "high").length;

    // Yesterday snapshot for deltas
    const yesterdayActive = events.filter((e: any) => activeStatuses.includes(e.status) && new Date(e.created_at) < new Date(yesterdayStart)).length;
    const yesterdayOverdueLeads = openLeads.filter(l => l.next_action_date && new Date(l.next_action_date) < new Date(yesterdayStart)).length;
    const yesterdayOverdueOffers = offers.filter((o: any) => o.status === "sent" && o.sent_at && differenceInDays(new Date(yesterdayStart), new Date(o.sent_at)) > 5).length;
    const yesterdayCritical = risks.filter(r => r.status === "open" && r.severity === "high" && new Date(r.created_at) < new Date(yesterdayStart)).length;

    const activeDelta = activeProjects - yesterdayActive;
    const overdueDelta = (overdueLeads.length + overdueOffers) - (yesterdayOverdueLeads + yesterdayOverdueOffers);
    const critDelta = criticalRisks - yesterdayCritical;

    // Risk delta 7d
    const highRisksNow = openRisks.filter(r => r.severity === "high").length;
    const highRisks7dAgo = risks.filter(r => r.status === "open" && r.severity === "high" && new Date(r.created_at) < d7).length;
    const riskDelta7d = highRisksNow - highRisks7dAgo;

    // Next meeting
    const nextMeeting = calEvents.find(m => new Date(m.event_start!) >= now);
    const nextMeetingTime = nextMeeting?.event_start ? format(new Date(nextMeeting.event_start), "HH:mm") : null;

    setToday({ activeProjects, meetingsToday, overdueFollowups: overdueLeads.length + overdueOffers, criticalRisks });
    setDeltas({
      activeProjects: activeDelta !== 0 ? activeDelta : null,
      meetingsToday: null,
      overdueFollowups: overdueDelta !== 0 ? overdueDelta : null,
      criticalRisks: critDelta !== 0 ? critDelta : null,
    });
    setTodayCtx({
      nextMeetingTime,
      overdueCount: overdueLeads.length,
      todayCount: todayActionLeads.length,
      riskDelta7d,
    });

    // ── SECTION 2: COMPANY HEALTH ──
    const totalCO = changeOrders.length;
    const pendingCO = changeOrders.filter((c: any) => ["draft", "sent"].includes(c.status)).length;
    const pendingPct = totalCO > 0 ? Math.round((pendingCO / totalCO) * 100) : 0;

    const riskScore = openRisks.reduce((s, r) => s + (r.severity === "high" ? 2 : r.severity === "medium" ? 1 : 0), 0);
    const riskPct = Math.min(100, Math.round((riskScore / Math.max(1, 20)) * 100));
    const riskStatus: "green" | "yellow" | "red" = riskScore >= 9 ? "red" : riskScore >= 4 ? "yellow" : "green";

    const mediumRiskCount = openRisks.filter(r => r.severity === "medium").length;
    const cashflowPct = 0;

    // Budget over 10% – approximate from change orders
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

    // ── TEMPO: BEVEGELSE SISTE 7 DAGER ──
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

    // ── PROJECT TEMPO SISTE 7 DAGER ──
    const riskChanges7d = risks.filter(r => new Date(r.updated_at || r.created_at) >= d7).length;
    const budgetChanges7d = changeOrders.filter((c: any) => new Date(c.created_at || "") >= d7).length;
    const plansApproved7d = events.filter((e: any) => e.status === "approved" && new Date(e.updated_at || e.created_at) >= d7).length;
    setProjectTempo([
      { label: "Nye prosjekter", value: newProjects7d },
      { label: "Endret risikonivå", value: riskChanges7d },
      { label: "Endret budsjettstatus", value: budgetChanges7d },
      { label: "Plan godkjent", value: plansApproved7d },
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

    // ── SECTION 4: ACTION REQUIRED (with priority scores) ──
    const techByUser = new Map<string, string>();
    for (const t of techs) if (t.user_id) techByUser.set(t.user_id, t.name);

    const actionList: ActionItem[] = [];

    // Leads without activity > 7d
    const leadsInactive7d = openLeads.filter(l => new Date(l.updated_at) < d7);
    if (leadsInactive7d.length > 0) {
      const hasOld = leadsInactive7d.some(l => new Date(l.updated_at) < d14);
      const urgency: ActionItem["urgency"] = hasOld ? "overdue" : "this_week";
      actionList.push({
        label: "Leads uten aktivitet > 7 dager", count: leadsInactive7d.length, severity: "warning", href: "/sales/leads",
        urgency, module: "Salg",
        priorityScore: calculateActionPriority({ urgency, isInactiveLead: true }),
      });
    }

    // Critical risks without mitigation
    const highRiskJobs = openRisks.filter(r => r.severity === "high");
    if (highRiskJobs.length > 0) {
      actionList.push({
        label: "Prosjekter med kritisk risiko", count: highRiskJobs.length, severity: "critical", href: "/projects",
        urgency: "today", module: "Prosjekt",
        priorityScore: calculateActionPriority({ urgency: "today", isHighRisk: true }),
      });
    }

    // Offers without follow-up
    if (overdueOffers > 0) {
      const hasVeryOld = offers.some((o: any) => o.status === "sent" && o.sent_at && differenceInDays(now, new Date(o.sent_at)) > 10);
      const urgency: ActionItem["urgency"] = hasVeryOld ? "overdue" : "this_week";
      actionList.push({
        label: "Tilbud uten oppfølging > 5 dager", count: overdueOffers, severity: "warning", href: "/sales/offers",
        urgency, module: "Salg",
        priorityScore: calculateActionPriority({ urgency }),
      });
    }

    // Projects without approved plan
    const requestedJobs = events.filter((e: any) => e.status === "requested").length;
    if (requestedJobs > 0) {
      actionList.push({
        label: "Prosjekter uten godkjent plan", count: requestedJobs, severity: "warning", href: "/projects",
        urgency: "this_week", module: "Prosjekt",
        priorityScore: calculateActionPriority({ urgency: "this_week", isProjectWithoutPlan: true }),
      });
    }

    // Overdue lead follow-ups
    if (overdueLeads.length > 0) {
      const hasOverdue = overdueLeads.some(l => differenceInDays(now, new Date(l.next_action_date!)) > 3);
      const urgency: ActionItem["urgency"] = hasOverdue ? "overdue" : "today";
      actionList.push({
        label: "Leads med forfalt oppfølging", count: overdueLeads.length, severity: "warning", href: "/sales/leads",
        urgency, module: "Salg",
        priorityScore: calculateActionPriority({ urgency }),
      });
    }

    // Calculations done without offer
    const { data: allCalcs } = await supabase.from("calculations").select("id, lead_id, status, created_at").is("deleted_at", null);
    const calcsWithOffer = new Set(offers.map((o: any) => o.calculation_id));
    const calcsNoOffer = (allCalcs || []).filter((c: any) => c.status === "approved" && !calcsWithOffer.has(c.id));
    if (calcsNoOffer.length > 0) {
      const hasOld = calcsNoOffer.some((c: any) => differenceInDays(now, new Date(c.created_at)) > 3);
      actionList.push({
        label: "Kalkyle ferdig uten tilbud", count: calcsNoOffer.length, severity: "info", href: "/sales/calculations",
        urgency: "this_week", module: "Salg",
        priorityScore: calculateActionPriority({ urgency: "this_week", isCalcWithoutOfferOld: hasOld }),
      });
    }

    // Sync errors
    const syncErrors = (calLinksRes.data || []).filter(l => l.sync_status === "error");
    if (syncErrors.length > 0) {
      actionList.push({
        label: "Synkroniseringsfeil", count: syncErrors.length, severity: "critical", href: "/admin/integration-health",
        urgency: "today", module: "System",
        priorityScore: calculateActionPriority({ urgency: "today", isSyncError: true }),
      });
    }

    // Sort by priority score descending
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

    // ── ACTIVITY FEED (last 24h) ──
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 w-full pb-24 lg:pb-8 max-w-[1400px] mx-auto">
      {/* Page header + Pulse */}
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-foreground">Oversikt</h1>
        <p className="text-xs text-muted-foreground">
          {format(new Date(), "EEEE d. MMMM", { locale: nb })} · Uke {format(new Date(), "w", { locale: nb })}
        </p>
        {pulse && <PulseStripe pulse={pulse} />}
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
          subline={todayCtx.nextMeetingTime ? `Neste kl ${todayCtx.nextMeetingTime}` : undefined}
          onClick={() => navigate("/sales/leads")}
        />
        <TodayBlock
          icon={<Clock className="h-4 w-4" />}
          label="Forfalte oppfølginger"
          value={today.overdueFollowups}
          delta={deltas.overdueFollowups}
          subline={todayCtx.overdueCount > 0 || todayCtx.todayCount > 0 ? `${todayCtx.overdueCount} forfalt · ${todayCtx.todayCount} i dag` : undefined}
          status={today.overdueFollowups > 0 ? "warning" : undefined}
          onClick={() => navigate("/sales/leads")}
        />
        <TodayBlock
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Kritiske risikoer"
          value={today.criticalRisks}
          delta={deltas.criticalRisks}
          subline={todayCtx.riskDelta7d !== 0 ? `${todayCtx.riskDelta7d > 0 ? "+" : ""}${todayCtx.riskDelta7d} siste 7d` : undefined}
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
                {g.micro && (
                  <span className="text-[9px] text-muted-foreground/70 text-center leading-tight max-w-[100px]">{g.micro}</span>
                )}
              </div>
            ))}
          </div>

          {/* Project tempo 7d */}
          {projectTempo.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/30">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Prosjekt-tempo siste 7 dager</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                {projectTempo.map(pt => {
                  const isPos = pt.value > 0;
                  const isNeg = pt.value < 0;
                  const arrow = isPos ? "↑" : isNeg ? "↓" : "";
                  const colorCls = isPos ? "text-success" : isNeg ? "text-destructive" : "text-muted-foreground";
                  return (
                    <div key={pt.label} className="flex items-center justify-between py-0.5">
                      <span className="text-[10px] text-muted-foreground">{pt.label}</span>
                      <span className={`text-[10px] font-mono font-medium ${colorCls}`}>
                        {pt.value === 0 ? "—" : `${arrow} ${Math.abs(pt.value)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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

      {/* ── AKTIVITET SISTE 24 TIMER ── */}
      <div>
        <SectionHeader title="Aktivitet siste 24 timer" />
        {activityFeed.length > 0 ? (
          <div className="space-y-0.5">
            {activityFeed.map(item => (
              <button
                key={item.id}
                onClick={() => navigate(item.href)}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-left hover:bg-secondary/50 transition-colors group"
              >
                <ActivityIcon type={item.type} />
                <span className="text-xs text-foreground flex-1 truncate">{item.description}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: nb })}
                </span>
                <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/60 py-4 text-center">Ingen ny aktivitet siste 24 timer</p>
        )}
      </div>

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

      {/* ── SECTION 4: KREVER HANDLING 2.0 ── */}
      <div>
        <SectionHeader title="Krever handling" />
        {actions.length > 0 ? (
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
                <span className="text-[9px] text-muted-foreground/70 shrink-0 hidden sm:inline">{a.module}</span>
                <UrgencyLabel urgency={a.urgency} />
                <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                  {a.count}
                </Badge>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/60 py-4 text-center">Systemet er i balanse. Ingen kritiske oppgaver.</p>
        )}
      </div>
    </div>
  );
}

// ── Today block ──

function TodayBlock({ icon, label, value, delta, subline, status, onClick }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  delta?: number | null;
  subline?: string;
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
        {subline && (
          <p className="text-[9px] text-muted-foreground/70 truncate mt-0.5">{subline}</p>
        )}
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
