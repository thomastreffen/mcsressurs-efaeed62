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

// ── Main ──

export default function OverviewPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);

  const [today, setToday] = useState<TodayMetrics>({ activeProjects: 0, meetingsToday: 0, overdueFollowups: 0, criticalRisks: 0 });
  const [deltas, setDeltas] = useState<TodayDeltas>({ activeProjects: null, meetingsToday: null, overdueFollowups: null, criticalRisks: null });
  const [todayCtx, setTodayCtx] = useState<TodayContext>({ nextMeetingTime: null, overdueCount: 0, todayCount: 0, riskDelta7d: 0 });
  const [tempoLines, setTempoLines] = useState<TempoLine[]>([]);
  const [weekResources, setWeekResources] = useState<{ name: string; hours: number }[]>([]);
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
      supabase.from("events").select("id, title, status, customer, start_time, end_time, meeting_join_url, internal_number, created_at, updated_at, event_technicians(technician_id, technicians(name))").is("deleted_at", null),
      supabase.from("job_risk_items").select("id, job_id, severity, status, category, created_at, updated_at"),
      supabase.from("offers").select("id, offer_number, status, total_inc_vat, sent_at, created_at, calculation_id, lead_id, calculations(customer_name, project_title)").order("created_at", { ascending: false }),
      supabase.from("job_change_orders").select("id, job_id, status, amount_ex_vat, created_at"),
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

    // ── TEMPO ──
    const newProjects7d = events.filter((e: any) => new Date(e.created_at) >= d7 && activeStatuses.includes(e.status)).length;
    const newLeads7d = leads.filter(l => new Date(l.created_at) >= d7).length;
    const offersSent7d = offers.filter((o: any) => o.status !== "draft" && o.sent_at && new Date(o.sent_at) >= d7).length;

    const pipelineValue = openLeads.reduce((s, l) => s + (Number(l.estimated_value || 0) * (Number(l.probability || 50) / 100)), 0);
    const leadsOlderThan7d = leads.filter(l => !["lost", "won"].includes(l.status) && new Date(l.created_at) < d7);
    const pipeline7dAgo = leadsOlderThan7d.reduce((s, l) => s + (Number(l.estimated_value || 0) * (Number(l.probability || 50) / 100)), 0);
    const pipelineDeltaK = Math.round((pipelineValue - pipeline7dAgo) / 1000);

    setTempoLines([
      { label: "Nye prosjekter", value: newProjects7d },
      { label: "Nye leads", value: newLeads7d },
      { label: "Tilbud sendt", value: offersSent7d },
      { label: "Endring HIGH-risiko", value: riskDelta7d },
      { label: "Pipeline-endring", value: pipelineDeltaK, suffix: "k" },
    ]);

    // ── WEEK RESOURCES ──
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
    setWeekResources(
      Object.entries(techHoursMap).map(([name, hours]) => ({ name, hours: Math.round(hours) })).sort((a, b) => b.hours - a.hours).slice(0, 5)
    );

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
        label: "Tilbud uten generert dokument", count: calcsNoOffer.length, severity: "info", href: "/sales/offers",
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
      feed.push({ id: `calc-${c.id}`, type: "offer", description: `Nytt tilbud: ${c.project_title}`, created_at: c.created_at, href: `/sales/offers` });
    }

    const offers24h = offers.filter((o: any) => new Date(o.created_at) >= new Date(h24));
    for (const o of offers24h.slice(0, 3)) {
      feed.push({ id: `offer-${o.id}`, type: "offer", description: `Tilbud sendt: ${o.offer_number}`, created_at: o.created_at, href: `/sales/offers` });
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
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 w-full pb-24 lg:pb-8 max-w-[1440px] mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Oversikt</h1>
        <p className="text-sm text-muted-foreground/70 mt-1">
          {format(new Date(), "EEEE d. MMMM yyyy", { locale: nb })} · Uke {format(new Date(), "w", { locale: nb })}
        </p>
        {pulse && <PulseStripe pulse={pulse} />}
      </div>

      {/* ── 1. KREVER HANDLING — Primary section, full width ── */}
      <div className="rounded-2xl bg-destructive/[0.03] border border-destructive/10 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <h2 className="text-base font-bold text-foreground tracking-tight">Krever handling</h2>
            {actions.length > 0 && (
              <Badge variant="destructive" className="text-[10px] font-mono rounded-full px-2 ml-1">
                {actions.reduce((s, a) => s + a.count, 0)}
              </Badge>
            )}
          </div>
        </div>
        {actions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {actions.slice(0, 9).map((a, i) => (
              <button
                key={i}
                onClick={() => navigate(a.href)}
                className="flex items-center gap-3 w-full rounded-xl px-3.5 py-3 text-left bg-card border border-border/30 hover:shadow-md hover:border-primary/20 active:scale-[0.99] transition-all duration-150 group"
              >
                <div className={`flex items-center justify-center h-9 w-9 rounded-full shrink-0 ${
                  a.severity === "critical" ? "bg-destructive/10" : a.severity === "warning" ? "bg-accent/10" : "bg-muted"
                }`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${
                    a.severity === "critical" ? "bg-destructive animate-pulse" : a.severity === "warning" ? "bg-accent" : "bg-muted-foreground"
                  }`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{a.label}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{a.module}</span>
                    <UrgencyBadge urgency={a.urgency} />
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs font-mono rounded-full px-2.5 py-0.5 font-bold">
                  {a.count}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary/60 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 py-4 px-2">
            <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
              <Activity className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Alt i balanse</p>
              <p className="text-xs text-muted-foreground/70">Ingen kritiske oppgaver akkurat nå</p>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. KPI CARDS — Compact secondary row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button onClick={() => navigate("/projects")}
          className="flex items-center gap-3 rounded-xl bg-card border border-border/40 px-4 py-3 hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-xl font-bold font-mono text-foreground leading-none">{today.activeProjects}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Prosjekter</p>
          </div>
          {deltas.activeProjects !== null && deltas.activeProjects !== 0 && (
            <span className={`text-[10px] font-mono font-medium ml-auto ${deltas.activeProjects > 0 ? "text-success" : "text-destructive"}`}>
              {deltas.activeProjects > 0 ? "+" : ""}{deltas.activeProjects}
            </span>
          )}
        </button>
        <button onClick={() => navigate("/sales/leads")}
          className="flex items-center gap-3 rounded-xl bg-card border border-border/40 px-4 py-3 hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <CalendarDays className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-xl font-bold font-mono text-foreground leading-none">{today.meetingsToday}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {todayCtx.nextMeetingTime ? `Neste kl ${todayCtx.nextMeetingTime}` : "Møter i dag"}
            </p>
          </div>
        </button>
        <button onClick={() => navigate("/sales/leads")}
          className="flex items-center gap-3 rounded-xl bg-card border border-border/40 px-4 py-3 hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all">
          <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${today.overdueFollowups > 0 ? "bg-accent/10" : "bg-muted"}`}>
            <Clock className={`h-4 w-4 ${today.overdueFollowups > 0 ? "text-accent" : "text-muted-foreground"}`} />
          </div>
          <div className="text-left min-w-0">
            <p className="text-xl font-bold font-mono text-foreground leading-none">{today.overdueFollowups}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Oppfølginger</p>
          </div>
          {deltas.overdueFollowups !== null && deltas.overdueFollowups !== 0 && (
            <span className={`text-[10px] font-mono font-medium ml-auto ${deltas.overdueFollowups > 0 ? "text-destructive" : "text-success"}`}>
              {deltas.overdueFollowups > 0 ? "+" : ""}{deltas.overdueFollowups}
            </span>
          )}
        </button>
        <button onClick={() => navigate("/projects")}
          className="flex items-center gap-3 rounded-xl bg-card border border-border/40 px-4 py-3 hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all">
          <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${today.criticalRisks > 0 ? "bg-destructive/10" : "bg-muted"}`}>
            <ShieldAlert className={`h-4 w-4 ${today.criticalRisks > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </div>
          <div className="text-left min-w-0">
            <p className="text-xl font-bold font-mono text-foreground leading-none">{today.criticalRisks}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Kritiske risikoer</p>
          </div>
          {deltas.criticalRisks !== null && deltas.criticalRisks !== 0 && (
            <span className={`text-[10px] font-mono font-medium ml-auto ${deltas.criticalRisks > 0 ? "text-destructive" : "text-success"}`}>
              {deltas.criticalRisks > 0 ? "+" : ""}{deltas.criticalRisks}
            </span>
          )}
        </button>
      </div>

      {/* ── 3. BEVEGELSE + AKTIVITET — Two columns ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bevegelse siste 7 dager */}
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

          {weekResources.length > 0 && (
            <div className="mt-5 pt-4 border-t border-border/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground">Ressursbelastning denne uken</span>
                <button onClick={() => navigate("/projects/plan")} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                  Plan <ArrowRight className="h-2.5 w-2.5" />
                </button>
              </div>
              <div className="space-y-2">
                {weekResources.map(r => (
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

        {/* Aktivitet siste 24 timer */}
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
