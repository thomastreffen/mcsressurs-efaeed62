import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, differenceInDays, startOfDay } from "date-fns";
import { nb } from "date-fns/locale";
import {
  CalendarDays, AlertTriangle, TrendingUp, ArrowRight, ChevronRight,
  Target, BarChart3, UserPlus, ReceiptText, Unplug, XCircle,
  Wrench, CheckCircle2, Clock, PieChart, PackageOpen, Inbox, FileQuestion, Plus,
} from "lucide-react";
import { JOB_STATUS_CONFIG, type JobStatus } from "@/lib/job-status";
import { OFFER_STATUS_CONFIG, type OfferStatus } from "@/lib/offer-status";
import { useAuth } from "@/hooks/useAuth";
import { PieChart as RPieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { RegulationDashboardWidget } from "@/components/regulation/RegulationDashboardWidget";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { PortfolioHealthGauges } from "@/components/dashboard/PortfolioHealthGauges";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Types ──

type DashboardMode = "drift" | "salg";

interface OpsData {
  jobsToday: number;
  dirtyJobs: number;
  failedLinks: number;
  disconnectedTechs: number;
  techLoad: { name: string; hours: number; color: string }[];
  statusBreakdown: { name: string; value: number; color: string }[];
  syncBreakdown: { name: string; value: number; color: string }[];
  actionItems: {
    unplannedJobs: number;
    missingToken: number;
    itemNotFound: number;
    jobsWithoutTeams: number;
  };
  recentJobs: { id: string; title: string; status: JobStatus; customer: string; internalNumber: string | null }[];
}

interface SalesData {
  leadsThisMonth: number;
  conversionRate: number;
  pipelineValue: number;
  offersSent: number;
  leadsPerSource: { name: string; value: number; color: string }[];
  pipelinePerOwner: { name: string; value: number }[];
  leadConversion: { stage: string; count: number }[];
  actionItems: {
    leadsNoFollowup: number;
    leadsInactive7d: number;
    offersNotFollowed: number;
  };
  recentOffers: { id: string; offer_number: string; status: OfferStatus; total_inc_vat: number; customer: string }[];
}

// ── Chart colors – MCS palette: blue primary, orange highlight only ──
const BLUE = "hsl(213, 60%, 42%)";
const BLUE_LIGHT = "hsl(213, 55%, 55%)";
const BLUE_PALE = "hsl(213, 50%, 68%)";
const ORANGE = "hsl(28, 80%, 52%)";
const GREEN = "hsl(152, 60%, 42%)";
const RED = "hsl(0, 72%, 51%)";
const GRAY = "hsl(215, 15%, 70%)";

export default function KpiDashboard() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [mode, setMode] = useState<DashboardMode>("drift");
  const [loading, setLoading] = useState(true);
  const [opsData, setOpsData] = useState<OpsData | null>(null);
  const [salesData, setSalesData] = useState<SalesData | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const now = new Date();
    const todayStart = startOfDay(now).toISOString();
    const todayEnd = new Date(startOfDay(now).getTime() + 86400000).toISOString();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now).toISOString();
    const monthEnd = endOfMonth(now).toISOString();

    // Parallel fetches
    const [eventsRes, techsRes, offersRes, leadsRes, calLinksRes, dirtyRes] = await Promise.all([
      supabase.from("events").select("id, title, status, customer, internal_number, start_time, end_time, calendar_dirty, meeting_join_url, event_technicians(technician_id, technicians(name, color))").is("deleted_at", null),
      supabase.from("technicians").select("id, name, color, user_id"),
      supabase.from("offers").select("*, calculations(customer_name, total_price)").order("created_at", { ascending: false }).limit(20),
      supabase.from("leads").select("id, status, estimated_value, probability, source, assigned_owner_user_id, next_action_date, updated_at, created_at").order("created_at", { ascending: false }),
      supabase.from("job_calendar_links").select("id, sync_status, last_error, technician_id, user_id"),
      supabase.from("events").select("id", { count: "exact", head: true }).eq("calendar_dirty", true).is("deleted_at", null),
    ]);

    const events = eventsRes.data || [];
    const techs = techsRes.data || [];
    const allOffers = offersRes.data || [];
    const allLeads = leadsRes.data || [];
    const calLinks = calLinksRes.data || [];

    // ── OPS ──
    const activeStatuses: JobStatus[] = ["requested", "approved", "scheduled", "in_progress", "time_change_proposed"];
    const jobsToday = events.filter((e: any) => e.start_time >= todayStart && e.start_time < todayEnd && activeStatuses.includes(e.status)).length;

    const failedLinks = calLinks.filter((l: any) => l.sync_status === "failed").length;
    const connectedUserIds = new Set(calLinks.filter((l: any) => l.sync_status === "linked").map((l: any) => l.user_id));
    const assignedTechIds = new Set(events.flatMap((e: any) => (e.event_technicians || []).map((et: any) => et.technician_id)));
    const disconnectedTechs = techs.filter(t => assignedTechIds.has(t.id) && !connectedUserIds.has(t.user_id)).length;

    // Tech load (this week)
    const thisWeekEvents = events.filter((e: any) => {
      const start = new Date(e.start_time);
      return start >= weekStart && start <= weekEnd;
    });
    const techHoursMap = new Map<string, { name: string; hours: number; color: string }>();
    for (const tech of techs) techHoursMap.set(tech.id, { name: tech.name, hours: 0, color: tech.color || BLUE });
    for (const ev of thisWeekEvents) {
      const hours = (new Date(ev.end_time).getTime() - new Date(ev.start_time).getTime()) / 3600000;
      for (const et of (ev as any).event_technicians || []) {
        const entry = techHoursMap.get(et.technician_id);
        if (entry) entry.hours += hours;
      }
    }
    const techLoad = Array.from(techHoursMap.values()).sort((a, b) => b.hours - a.hours).slice(0, 8);

    // Status breakdown
    const statusCounts: Record<string, number> = {};
    for (const ev of events) {
      statusCounts[ev.status] = (statusCounts[ev.status] || 0) + 1;
    }
    const statusColors: Record<string, string> = {
      requested: ORANGE, approved: GREEN, scheduled: BLUE_LIGHT,
      in_progress: BLUE, completed: GREEN, time_change_proposed: BLUE_PALE,
      rejected: RED, ready_for_invoicing: ORANGE, invoiced: GRAY,
    };
    const statusBreakdown = Object.entries(statusCounts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: JOB_STATUS_CONFIG[k as JobStatus]?.label || k, value: v, color: statusColors[k] || GRAY }));

    // Sync breakdown
    const syncCounts: Record<string, number> = {};
    for (const l of calLinks) syncCounts[l.sync_status as string] = (syncCounts[l.sync_status as string] || 0) + 1;
    const syncColors: Record<string, string> = { linked: GREEN, unlinked: GRAY, failed: RED, pending: ORANGE };
    const syncBreakdown = Object.entries(syncCounts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: k === "linked" ? "OK" : k === "failed" ? "Feil" : k === "unlinked" ? "Ikke koblet" : "Ventende", value: v, color: syncColors[k] || GRAY }));

    // Action items
    const unplannedJobs = events.filter((e: any) => e.status === "requested").length;
    const missingToken = calLinks.filter((l: any) => {
      if (l.sync_status !== "failed" || !l.last_error) return false;
      try { const parsed = JSON.parse(l.last_error as string); return parsed?.error_code === "missing_token"; } catch { return false; }
    }).length;
    const itemNotFound = calLinks.filter((l: any) => {
      if (l.sync_status !== "failed" || !l.last_error) return false;
      try { const parsed = JSON.parse(l.last_error as string); return ["itemNotFound", "item_not_found"].includes(parsed?.error_code); } catch { return false; }
    }).length;
    const jobsWithoutTeams = events.filter((e: any) => activeStatuses.includes(e.status) && !e.meeting_join_url).length;

    const recentJobs = events.slice(0, 6).map((e: any) => ({
      id: e.id, title: e.title, status: e.status as JobStatus, customer: e.customer || "", internalNumber: e.internal_number,
    }));

    setOpsData({
      jobsToday, dirtyJobs: dirtyRes.count || 0, failedLinks, disconnectedTechs,
      techLoad, statusBreakdown, syncBreakdown,
      actionItems: { unplannedJobs, missingToken, itemNotFound, jobsWithoutTeams },
      recentJobs,
    });

    // ── SALES ──
    const monthLeads = allLeads.filter(l => l.created_at >= monthStart && l.created_at <= monthEnd);
    const monthOffers = allOffers.filter((o: any) => o.created_at >= monthStart && o.created_at <= monthEnd);
    const won = monthOffers.filter((o: any) => o.status === "accepted");
    const lost = monthOffers.filter((o: any) => o.status === "rejected");
    const decided = won.length + lost.length;
    const conversionRate = decided > 0 ? (won.length / decided) * 100 : 0;
    const offersSent = monthOffers.filter((o: any) => o.status !== "draft").length;

    const openLeads = allLeads.filter(l => !["lost", "won"].includes(l.status));
    const pipelineLeads = openLeads.reduce((s, l) => s + (Number(l.estimated_value || 0) * (Number(l.probability || 50) / 100)), 0);
    const pipelineOffers = allOffers.filter((o: any) => ["draft", "sent"].includes(o.status)).reduce((s: number, o: any) => s + Number(o.total_inc_vat), 0);

    // Leads per source
    const sourceCounts: Record<string, number> = {};
    for (const l of openLeads) {
      const src = l.source || "Ukjent";
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    }
    const sourceColors = [BLUE, ORANGE, BLUE_LIGHT, GREEN, BLUE_PALE, GRAY];
    const leadsPerSource = Object.entries(sourceCounts).map(([k, v], i) => ({ name: k, value: v, color: sourceColors[i % sourceColors.length] }));

    // Lead conversion funnel
    const stageCounts: Record<string, number> = { new: 0, contacted: 0, befaring: 0, qualified: 0, tilbud_sendt: 0, forhandling: 0, won: 0 };
    for (const l of allLeads) { if (stageCounts[l.status] !== undefined) stageCounts[l.status]++; }
    const stageLabels: Record<string, string> = { new: "Ny", contacted: "Kontaktet", befaring: "Befaring", qualified: "Kvalifisert", tilbud_sendt: "Tilbud sendt", forhandling: "Forhandling", won: "Vunnet" };
    const leadConversion = Object.entries(stageCounts).map(([k, v]) => ({ stage: stageLabels[k] || k, count: v }));

    // Pipeline per owner – resolve tech names
    const techNameMap = new Map<string, string>();
    for (const t of techs) { if (t.user_id) techNameMap.set(t.user_id, t.name); }

    const ownerPipeline: Record<string, number> = {};
    for (const l of openLeads) {
      const owner = l.assigned_owner_user_id || "Uten eier";
      ownerPipeline[owner] = (ownerPipeline[owner] || 0) + (Number(l.estimated_value || 0) * (Number(l.probability || 50) / 100));
    }
    const pipelinePerOwner = Object.entries(ownerPipeline)
      .map(([k, v]) => ({
        name: k === "Uten eier" ? "Uten eier" : (techNameMap.get(k) || "Ukjent selger"),
        value: Math.round(v),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Action items
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const leadsNoFollowup = openLeads.filter(l => !l.next_action_date).length;
    const leadsInactive7d = openLeads.filter(l => new Date(l.updated_at) < sevenDaysAgo).length;
    const offersNotFollowed = allOffers.filter((o: any) => o.status === "sent" && o.sent_at && differenceInDays(now, new Date(o.sent_at)) > 5).length;

    const recentOffers = allOffers.slice(0, 5).map((o: any) => ({
      id: o.id, offer_number: o.offer_number, status: o.status as OfferStatus,
      total_inc_vat: Number(o.total_inc_vat), customer: o.calculations?.customer_name || "",
    }));

    setSalesData({
      leadsThisMonth: monthLeads.length, conversionRate, pipelineValue: pipelineLeads + pipelineOffers, offersSent,
      leadsPerSource, pipelinePerOwner, leadConversion,
      actionItems: { leadsNoFollowup, leadsInactive7d, offersNotFollowed },
      recentOffers,
    });

    setLoading(false);
  }

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="p-4 sm:p-5 md:p-8 space-y-5 sm:space-y-8 w-full pb-24 lg:pb-8">
      {/* Header with toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Uke {format(new Date(), "w", { locale: nb })} · {format(new Date(), "MMMM yyyy", { locale: nb })}
          </p>
        </div>

        {isAdmin && (
          <div className="inline-flex rounded-xl bg-secondary p-1 gap-0.5">
            <button
              onClick={() => setMode("drift")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === "drift"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Wrench className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
              Drift
            </button>
            <button
              onClick={() => setMode("salg")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === "salg"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
              Salg
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {mode === "drift" && opsData && <OpsDashboard data={opsData} navigate={navigate} />}
      {mode === "salg" && salesData && <SalesDashboardView data={salesData} navigate={navigate} />}
    </div>
  );
}

// ── Ops Dashboard ──

function OpsDashboard({ data, navigate }: { data: OpsData; navigate: (path: string) => void }) {
  const isMobile = useIsMobile();

  const techChartData = useMemo(() => {
    const sorted = data.techLoad.filter(t => t.hours > 0).sort((a, b) => b.hours - a.hours);
    const top = sorted.slice(0, 8);
    const rest = sorted.slice(8);
    if (rest.length > 0) {
      top.push({ name: `Andre (${rest.length})`, hours: rest.reduce((s, t) => s + t.hours, 0), color: "hsl(215, 12%, 70%)" });
    }
    return top;
  }, [data.techLoad]);
  const totalPlannedHours = useMemo(() => data.techLoad.filter(t => t.hours > 0).reduce((s, t) => s + t.hours, 0), [data.techLoad]);
  const techsWithJobs = useMemo(() => data.techLoad.filter(t => t.hours > 0).length, [data.techLoad]);
  const totalJobs = useMemo(() => data.statusBreakdown.reduce((s, d) => s + d.value, 0), [data.statusBreakdown]);
  const totalSync = useMemo(() => data.syncBreakdown.reduce((s, d) => s + d.value, 0), [data.syncBreakdown]);
  const syncOk = useMemo(() => data.syncBreakdown.find(d => d.name === "OK")?.value ?? 0, [data.syncBreakdown]);
  const syncFail = useMemo(() => data.syncBreakdown.find(d => d.name === "Feil")?.value ?? 0, [data.syncBreakdown]);

  const renderBarLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    if (isMobile) return null; // skip labels on mobile to avoid clipping
    return (
      <text x={x + width + 6} y={y + height / 2} fill="hsl(215, 12%, 50%)" fontSize={11} dominantBaseline="central">
        {Math.round(value)} t
      </text>
    );
  };

  return (
    <div className="space-y-5 sm:space-y-8 md:space-y-10">
      {/* Portfolio Health Gauges */}
      <PortfolioHealthGauges />
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        <KpiCard title="Jobber i dag" value={data.jobsToday} icon={<CalendarDays className="h-4 w-4 sm:h-5 sm:w-5" />} onClick={() => navigate("/projects")} />
        <KpiCard title="Usynkede jobber" value={data.dirtyJobs} icon={<Clock className="h-4 w-4 sm:h-5 sm:w-5" />} variant={data.dirtyJobs > 0 ? "warning" : "default"} onClick={() => navigate("/projects")} />
        <KpiCard title="Feilede synk" value={data.failedLinks} icon={<XCircle className="h-4 w-4 sm:h-5 sm:w-5" />} variant={data.failedLinks > 0 ? "error" : "default"} onClick={() => navigate("/admin/integration-health")} />
        <KpiCard title="Uten Microsoft" value={data.disconnectedTechs} icon={<Unplug className="h-4 w-4 sm:h-5 sm:w-5" />} variant={data.disconnectedTechs > 0 ? "warning" : "default"} onClick={() => navigate("/admin/integration-health")} />
      </div>

      {/* Resource load (8/12) + Job status (4/12) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5">
        <div className="lg:col-span-8">
          <SectionCard title="Ressursbelastning" subtitle={`Totalt: ${Math.round(totalPlannedHours)} t · ${techsWithJobs} montører`} icon={<BarChart3 className="h-4 w-4" />}>
            {techChartData.length > 0 ? (
              <div className="w-full" style={{ minHeight: isMobile ? 180 : 260 }}>
                <ResponsiveContainer width="100%" height={Math.max(isMobile ? 180 : 260, techChartData.length * (isMobile ? 28 : 34))}>
                  <BarChart data={techChartData} layout="vertical" margin={{ left: 0, right: isMobile ? 8 : 40, top: 4, bottom: 4 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={isMobile ? 70 : 100} tick={{ fontSize: isMobile ? 10 : 12, fill: "hsl(215, 12%, 50%)" }} axisLine={false} tickLine={false} interval={0} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)}t`, "Timer"]} contentStyle={{ borderRadius: 12, border: "1px solid hsl(214, 20%, 90%)", fontSize: 12 }} />
                    <Bar dataKey="hours" radius={[0, 6, 6, 0]} fill={BLUE} barSize={isMobile ? 14 : 18} maxBarSize={22} label={renderBarLabel} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState icon={<BarChart3 />} message="Ingen planlagte timer denne uken" ctaLabel="Opprett ny jobb" onCta={() => navigate("/projects/plan")} />
            )}
          </SectionCard>
        </div>

        <div className="lg:col-span-4">
          <SectionCard title="Jobbstatus" subtitle="Aktive jobber" icon={<PieChart className="h-4 w-4" />}>
            {data.statusBreakdown.length > 0 ? (
              <div className="flex flex-col items-center gap-3 sm:gap-4">
                <div className="h-36 w-36 sm:h-48 sm:w-48 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <RPieChart>
                      <Pie data={data.statusBreakdown} cx="50%" cy="50%" innerRadius={isMobile ? 36 : 48} outerRadius={isMobile ? 56 : 72} paddingAngle={2} dataKey="value" strokeWidth={0}>
                        {data.statusBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(214, 20%, 90%)", fontSize: 12 }} formatter={(v: number) => [v, ""]} />
                    </RPieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl sm:text-3xl font-bold text-foreground">{totalJobs}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Totalt</span>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-x-3 sm:gap-x-4 gap-y-1">
                  {data.statusBreakdown.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                      <div className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-muted-foreground truncate max-w-[80px]">{d.name}</span>
                      <span className="font-medium text-foreground">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState icon={<PieChart />} message="Ingen jobber registrert" ctaLabel="Opprett ny jobb" onCta={() => navigate("/projects/plan")} />
            )}
          </SectionCard>
        </div>
      </div>

      {/* Sync status */}
      <SectionCard title="Synk-status" subtitle="Kalenderkoblinger" icon={<CheckCircle2 className="h-4 w-4" />}>
        {data.syncBreakdown.length > 0 ? (
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
            <div className="h-32 w-32 sm:h-40 sm:w-40 shrink-0 relative">
              <ResponsiveContainer width="100%" height="100%">
                <RPieChart>
                  <Pie data={data.syncBreakdown} cx="50%" cy="50%" innerRadius={isMobile ? 28 : 36} outerRadius={isMobile ? 48 : 56} paddingAngle={2} dataKey="value" strokeWidth={0}>
                    {data.syncBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(214, 20%, 90%)", fontSize: 12 }} formatter={(v: number) => [v, ""]} />
                </RPieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl sm:text-2xl font-bold text-foreground">{totalSync}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:gap-3">
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-status-approved" />
                  <span className="text-xs sm:text-sm text-muted-foreground">OK</span>
                  <span className="text-base sm:text-lg font-semibold text-foreground">{syncOk}</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Feil</span>
                  <span className="text-base sm:text-lg font-semibold text-foreground">{syncFail}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 sm:gap-4">
                {data.syncBreakdown.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                    <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="font-semibold text-foreground">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState icon={<Unplug />} message="Ingen kalenderkoblinger" ctaLabel="Se integrasjoner" onCta={() => navigate("/admin/integration-health")} />
        )}
      </SectionCard>

      {/* Fag widget */}
      <RegulationDashboardWidget />

      {/* Action items + Recent jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5">
        <div className="rounded-2xl shadow-sm bg-card overflow-hidden">
          <div className="h-1 bg-accent/60" />
          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                  <AlertTriangle className="h-4 w-4" /> Krever handling
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Oppgaver som venter</p>
              </div>
            </div>
            <div className="space-y-1">
              <ActionItem label="Jobber uten plan" count={data.actionItems.unplannedJobs} variant="warning" onClick={() => navigate("/projects")} />
              <ActionItem label="Mangler Microsoft-token" count={data.actionItems.missingToken} variant="warning" onClick={() => navigate("/admin/integration-health")} />
              <ActionItem label="Outlook-event slettet" count={data.actionItems.itemNotFound} variant="error" onClick={() => navigate("/admin/integration-health")} />
              <ActionItem label="Jobber uten Teams-møte" count={data.actionItems.jobsWithoutTeams} variant="default" onClick={() => navigate("/projects")} />
            </div>
          </div>
        </div>

        <SectionCard title="Siste jobber" subtitle="" icon={<CalendarDays className="h-4 w-4" />} action={<Button variant="ghost" size="sm" onClick={() => navigate("/projects")} className="gap-1 text-xs h-7">Vis alle <ArrowRight className="h-3 w-3" /></Button>}>
          <div className="space-y-1">
            {data.recentJobs.length > 0 ? data.recentJobs.map((job) => (
              <button
                key={job.id}
                onClick={() => navigate(`/projects/${job.id}`)}
                className="flex items-center gap-2 sm:gap-3 w-full rounded-xl p-2.5 sm:p-3 text-left hover:bg-secondary/50 active:bg-secondary/70 transition-colors focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate leading-tight">{job.title}</p>
                  <p className="text-xs text-muted-foreground truncate leading-tight">{job.internalNumber && `${job.internalNumber} · `}{job.customer}</p>
                </div>
                <Badge
                  className="shrink-0 text-[10px] rounded-full px-2"
                  style={{
                    backgroundColor: `hsl(var(--status-${job.status.replace(/_/g, "-")}))`,
                    color: `hsl(var(--status-${job.status.replace(/_/g, "-")}-foreground))`,
                  }}
                >
                  {JOB_STATUS_CONFIG[job.status]?.label || job.status}
                </Badge>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:block" />
              </button>
            )) : (
              <EmptyState icon={<CalendarDays />} message="Ingen jobber ennå" ctaLabel="Opprett ny jobb" onCta={() => navigate("/projects/plan")} />
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ── Sales Dashboard View ──

function SalesDashboardView({ data, navigate }: { data: SalesData; navigate: (path: string) => void }) {
  const isMobile = useIsMobile();

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard title="Leads denne mnd" value={data.leadsThisMonth} icon={<UserPlus className="h-4 w-4" />} onClick={() => navigate("/sales/leads")} />
        <KpiCard title="Konverteringsrate" value={`${data.conversionRate.toFixed(0)}%`} icon={<Target className="h-4 w-4" />} onClick={() => navigate("/sales/pipeline")} />
        <KpiCard title="Pipeline-verdi" value={`kr ${(data.pipelineValue / 1000).toFixed(0)}k`} icon={<TrendingUp className="h-4 w-4" />} accent onClick={() => navigate("/sales/pipeline")} />
        <KpiCard title="Tilbud sendt" value={data.offersSent} icon={<ReceiptText className="h-4 w-4" />} onClick={() => navigate("/sales/offers")} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-5">
        {/* Lead funnel */}
        <SectionCard title="Lead → Jobb" subtitle="Konverteringstrakt" icon={<TrendingUp className="h-4 w-4" />}>
          {data.leadConversion.some(d => d.count > 0) ? (
            <div className="w-full" style={{ height: isMobile ? 160 : 192 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.leadConversion} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <XAxis dataKey="stage" tick={{ fontSize: isMobile ? 9 : 10, fill: "hsl(215, 12%, 50%)" }} axisLine={false} tickLine={false} interval={0} angle={isMobile ? -30 : 0} textAnchor={isMobile ? "end" : "middle"} height={isMobile ? 40 : 30} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(214, 20%, 90%)", fontSize: 12 }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} fill={BLUE} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon={<TrendingUp />} message="Ingen data ennå" ctaLabel="Opprett lead" onCta={() => navigate("/sales/leads")} />
          )}
        </SectionCard>

        {/* Pipeline per selger */}
        <SectionCard title="Pipeline per selger" subtitle="Vektet verdi" icon={<BarChart3 className="h-4 w-4" />}>
          {data.pipelinePerOwner.length > 0 ? (
            <>
              <div className="w-full" style={{ height: isMobile ? 140 : 192 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.pipelinePerOwner} layout="vertical" margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={isMobile ? 75 : 90} tick={{ fontSize: isMobile ? 10 : 11, fill: "hsl(215, 12%, 50%)" }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: number) => [`kr ${(v / 1000).toFixed(0)}k`, "Verdi"]} contentStyle={{ borderRadius: 12, border: "1px solid hsl(214, 20%, 90%)", fontSize: 12 }} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={BLUE_LIGHT} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Mobile: value list below chart */}
              {isMobile && (
                <div className="mt-2 space-y-1 border-t pt-2">
                  {data.pipelinePerOwner.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate max-w-[140px]">{d.name}</span>
                      <span className="font-medium text-foreground font-mono">kr {(d.value / 1000).toFixed(0)}k</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <EmptyState icon={<BarChart3 />} message="Ingen pipeline-data ennå" ctaLabel="Opprett lead" onCta={() => navigate("/sales/leads")} />
          )}
        </SectionCard>

        {/* Leads per kilde */}
        <SectionCard title="Leads per kilde" subtitle="Aktive leads" icon={<PieChart className="h-4 w-4" />}>
          {data.leadsPerSource.length > 0 ? (
            <DonutChart data={data.leadsPerSource} isMobile={isMobile} />
          ) : (
            <EmptyState icon={<PieChart />} message="Ingen aktive leads" ctaLabel="Opprett lead" onCta={() => navigate("/sales/leads")} />
          )}
        </SectionCard>
      </div>

      {/* Action items + recent offers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5">
        <SectionCard title="Krever oppfølging" subtitle="Salgsoppgaver" icon={<AlertTriangle className="h-4 w-4" />}>
          <div className="space-y-1">
            <ActionItem label="Leads uten oppfølging" count={data.actionItems.leadsNoFollowup} variant="warning" onClick={() => navigate("/sales/leads")} />
            <ActionItem label="Leads uten aktivitet >7d" count={data.actionItems.leadsInactive7d} variant="warning" onClick={() => navigate("/sales/leads")} />
            <ActionItem label="Tilbud uten oppfølging" count={data.actionItems.offersNotFollowed} variant="error" onClick={() => navigate("/sales/offers")} />
          </div>
        </SectionCard>

        <SectionCard title="Siste tilbud" subtitle="" icon={<ReceiptText className="h-4 w-4" />} action={<Button variant="ghost" size="sm" onClick={() => navigate("/sales/offers")} className="gap-1 text-xs h-7">Vis alle <ArrowRight className="h-3 w-3" /></Button>}>
          <div className="space-y-1">
            {data.recentOffers.length > 0 ? data.recentOffers.map((offer) => (
              <button
                key={offer.id}
                onClick={() => navigate("/sales/offers")}
                className="flex items-center gap-2 sm:gap-3 w-full rounded-xl p-2.5 text-left hover:bg-secondary/50 active:bg-secondary/70 transition-colors focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate leading-tight">{offer.offer_number}</p>
                  <p className="text-xs text-muted-foreground truncate leading-tight">{offer.customer}</p>
                </div>
                <span className="text-xs font-mono text-muted-foreground shrink-0">
                  kr {offer.total_inc_vat.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
                </span>
                <Badge className={OFFER_STATUS_CONFIG[offer.status]?.className + " text-[10px] rounded-full px-2 shrink-0"}>
                  {OFFER_STATUS_CONFIG[offer.status]?.label}
                </Badge>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:block" />
              </button>
            )) : (
              <EmptyState icon={<ReceiptText />} message="Ingen tilbud sendt ennå" ctaLabel="Opprett tilbud" onCta={() => navigate("/sales/offers")} />
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ── Shared Components ──

function KpiCard({ title, value, icon, variant, accent, onClick }: {
  title: string; value: number | string; icon: React.ReactNode;
  variant?: "default" | "warning" | "error"; accent?: boolean;
  onClick?: () => void;
}) {
  const hasIssue = (variant === "error" && value !== 0) || (variant === "warning" && value !== 0);
  const bgClass = hasIssue && variant === "error" ? "bg-destructive/[0.04]" : hasIssue && variant === "warning" ? "bg-accent/[0.04]" : "bg-card";
  const iconClass = accent ? "text-primary" : hasIssue && variant === "error" ? "text-destructive" : hasIssue && variant === "warning" ? "text-accent" : "text-muted-foreground";
  const clickable = !!onClick;

  return (
    <div
      className={`rounded-2xl shadow-sm p-4 sm:p-6 md:p-8 transition-all duration-200 hover:shadow-md hover:scale-[1.01] ${bgClass} ${clickable ? "cursor-pointer" : ""}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter") onClick?.(); } : undefined}
    >
      <div className={`flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] uppercase tracking-wider font-medium ${iconClass} mb-2 sm:mb-4`}>
        {icon}
        <span className="truncate">{title}</span>
      </div>
      <p className="text-2xl sm:text-4xl md:text-5xl font-bold text-foreground tracking-tight leading-none">{value}</p>
    </div>
  );
}

function SectionCard({ title, subtitle, icon, children, action }: {
  title: string; subtitle?: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl shadow-sm bg-card p-4 sm:p-5 md:p-6">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
            {icon} <span className="truncate">{title}</span>
          </h3>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ActionItem({ label, count, variant, onClick }: {
  label: string; count: number; variant: "warning" | "error" | "default"; onClick: () => void;
}) {
  if (count === 0) return (
    <div className="flex items-center justify-between py-2 sm:py-2.5 px-2 sm:px-3 rounded-xl">
      <span className="text-xs sm:text-sm text-muted-foreground truncate">{label}</span>
      <Badge variant="outline" className="text-[10px] rounded-full bg-status-approved/10 text-status-approved border-status-approved/20">OK</Badge>
    </div>
  );

  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between w-full py-2 sm:py-2.5 px-2 sm:px-3 rounded-xl hover:bg-secondary/60 active:bg-secondary/80 transition-colors focus-visible:ring-2 focus-visible:ring-ring cursor-pointer group min-h-[44px]"
    >
      <span className="text-xs sm:text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">{label}</span>
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <Badge
          className={`text-[10px] rounded-full px-2 ${
            variant === "error"
              ? "bg-destructive/10 text-destructive border-destructive/20"
              : "bg-accent/10 text-accent border-accent/20"
          }`}
          variant="outline"
        >
          {count}
        </Badge>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
}

function EmptyState({ icon, message, ctaLabel, onCta }: {
  icon: React.ReactNode; message: string; ctaLabel?: string; onCta?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-6 sm:py-8 gap-2 text-center">
      <div className="text-muted-foreground/30 [&>svg]:h-6 [&>svg]:w-6 sm:[&>svg]:h-8 sm:[&>svg]:w-8">{icon}</div>
      <p className="text-xs sm:text-sm text-muted-foreground font-medium">{message}</p>
      {ctaLabel && onCta && (
        <Button variant="outline" size="sm" onClick={onCta} className="mt-1 h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {ctaLabel}
        </Button>
      )}
    </div>
  );
}

function DonutChart({ data, isMobile }: { data: { name: string; value: number; color: string }[]; isMobile?: boolean }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className={`flex ${isMobile ? "flex-col" : "flex-row"} items-center gap-3 sm:gap-4`}>
      <div className={`${isMobile ? "h-28 w-28" : "h-36 w-36"} shrink-0`}>
        <ResponsiveContainer width="100%" height="100%">
          <RPieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={isMobile ? 28 : 36}
              outerRadius={isMobile ? 44 : 56}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid hsl(214, 20%, 90%)", fontSize: 12 }}
              formatter={(v: number) => [v, ""]}
            />
          </RPieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1 min-w-0 flex-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
            <div className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-muted-foreground truncate flex-1">{d.name}</span>
            <span className="font-medium text-foreground">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
