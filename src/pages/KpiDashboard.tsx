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
  CalendarDays, AlertTriangle, Loader2, TrendingUp, ArrowRight,
  Target, BarChart3, UserPlus, ReceiptText, Unplug, XCircle,
  Wrench, CheckCircle2, Clock, Video, PieChart,
} from "lucide-react";
import { JOB_STATUS_CONFIG, type JobStatus } from "@/lib/job-status";
import { OFFER_STATUS_CONFIG, type OfferStatus } from "@/lib/offer-status";
import { useAuth } from "@/hooks/useAuth";
import { PieChart as RPieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

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

    // Pipeline per owner (simplified - just show user_ids, would need profiles for names)
    const ownerPipeline: Record<string, number> = {};
    for (const l of openLeads) {
      const owner = l.assigned_owner_user_id || "Uten eier";
      ownerPipeline[owner] = (ownerPipeline[owner] || 0) + (Number(l.estimated_value || 0) * (Number(l.probability || 50) / 100));
    }
    const pipelinePerOwner = Object.entries(ownerPipeline)
      .map(([k, v]) => ({ name: k === "Uten eier" ? "Uten eier" : `Selger ${k.slice(0, 6)}..`, value: Math.round(v) }))
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

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-5 sm:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header with toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
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
  return (
    <div className="space-y-8">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard title="Jobber i dag" value={data.jobsToday} icon={<CalendarDays className="h-4 w-4" />} />
        <KpiCard title="Usynkede jobber" value={data.dirtyJobs} icon={<Clock className="h-4 w-4" />} variant={data.dirtyJobs > 0 ? "warning" : "default"} />
        <KpiCard title="Feilede synk" value={data.failedLinks} icon={<XCircle className="h-4 w-4" />} variant={data.failedLinks > 0 ? "error" : "default"} />
        <KpiCard title="Uten Microsoft" value={data.disconnectedTechs} icon={<Unplug className="h-4 w-4" />} variant={data.disconnectedTechs > 0 ? "warning" : "default"} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Resource load */}
        <SectionCard title="Ressursbelastning" subtitle="Timer denne uke" icon={<BarChart3 className="h-4 w-4" />}>
          {data.techLoad.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.techLoad} layout="vertical" margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12, fill: "hsl(215, 12%, 50%)" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(1)}t`, "Timer"]} contentStyle={{ borderRadius: 12, border: "1px solid hsl(214, 20%, 90%)", fontSize: 12 }} />
                  <Bar dataKey="hours" radius={[0, 6, 6, 0]} fill={BLUE} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Ingen planlagte timer</p>
          )}
        </SectionCard>

        {/* Job status donut */}
        <SectionCard title="Jobbstatus" subtitle="Aktive jobber" icon={<PieChart className="h-4 w-4" />}>
          {data.statusBreakdown.length > 0 ? (
            <DonutChart data={data.statusBreakdown} />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Ingen jobber</p>
          )}
        </SectionCard>

        {/* Sync status donut */}
        <SectionCard title="Synk-status" subtitle="Kalenderkoblinger" icon={<CheckCircle2 className="h-4 w-4" />}>
          {data.syncBreakdown.length > 0 ? (
            <DonutChart data={data.syncBreakdown} />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Ingen koblinger</p>
          )}
        </SectionCard>
      </div>

      {/* Action items + recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Krever handling" subtitle="Oppgaver som venter" icon={<AlertTriangle className="h-4 w-4" />}>
          <div className="space-y-2">
            <ActionItem label="Jobber uten plan" count={data.actionItems.unplannedJobs} variant="warning" onClick={() => navigate("/jobs")} />
            <ActionItem label="Mangler Microsoft-token" count={data.actionItems.missingToken} variant="warning" onClick={() => navigate("/admin/integration-health")} />
            <ActionItem label="Outlook-event slettet" count={data.actionItems.itemNotFound} variant="error" onClick={() => navigate("/admin/integration-health")} />
            <ActionItem label="Jobber uten Teams-møte" count={data.actionItems.jobsWithoutTeams} variant="default" onClick={() => navigate("/jobs")} />
          </div>
        </SectionCard>

        <SectionCard title="Siste jobber" subtitle="" icon={<CalendarDays className="h-4 w-4" />} action={<Button variant="ghost" size="sm" onClick={() => navigate("/jobs")} className="gap-1 text-xs h-7">Se alle <ArrowRight className="h-3 w-3" /></Button>}>
          <div className="space-y-1.5">
            {data.recentJobs.map((job) => (
              <button
                key={job.id}
                onClick={() => navigate(`/jobs/${job.id}`)}
                className="flex items-center gap-3 w-full rounded-xl p-2.5 text-left hover:bg-secondary/50 transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{job.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{job.internalNumber && `${job.internalNumber} · `}{job.customer}</p>
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
              </button>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ── Sales Dashboard View ──

function SalesDashboardView({ data, navigate }: { data: SalesData; navigate: (path: string) => void }) {
  return (
    <div className="space-y-8">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard title="Leads denne mnd" value={data.leadsThisMonth} icon={<UserPlus className="h-4 w-4" />} />
        <KpiCard title="Konverteringsrate" value={`${data.conversionRate.toFixed(0)}%`} icon={<Target className="h-4 w-4" />} />
        <KpiCard title="Pipeline-verdi" value={`kr ${(data.pipelineValue / 1000).toFixed(0)}k`} icon={<TrendingUp className="h-4 w-4" />} accent />
        <KpiCard title="Tilbud sendt" value={data.offersSent} icon={<ReceiptText className="h-4 w-4" />} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Lead funnel */}
        <SectionCard title="Lead → Jobb" subtitle="Konverteringstrakt" icon={<TrendingUp className="h-4 w-4" />}>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.leadConversion} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <XAxis dataKey="stage" tick={{ fontSize: 10, fill: "hsl(215, 12%, 50%)" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(214, 20%, 90%)", fontSize: 12 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} fill={BLUE} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {/* Pipeline per selger */}
        <SectionCard title="Pipeline per selger" subtitle="Vektet verdi" icon={<BarChart3 className="h-4 w-4" />}>
          {data.pipelinePerOwner.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.pipelinePerOwner} layout="vertical" margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "hsl(215, 12%, 50%)" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => [`kr ${(v / 1000).toFixed(0)}k`, "Verdi"]} contentStyle={{ borderRadius: 12, border: "1px solid hsl(214, 20%, 90%)", fontSize: 12 }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={BLUE_LIGHT} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Ingen pipeline-data</p>
          )}
        </SectionCard>

        {/* Leads per kilde */}
        <SectionCard title="Leads per kilde" subtitle="Aktive leads" icon={<PieChart className="h-4 w-4" />}>
          {data.leadsPerSource.length > 0 ? (
            <DonutChart data={data.leadsPerSource} />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Ingen leads</p>
          )}
        </SectionCard>
      </div>

      {/* Action items + recent offers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Krever oppfølging" subtitle="Salgsoppgaver" icon={<AlertTriangle className="h-4 w-4" />}>
          <div className="space-y-2">
            <ActionItem label="Leads uten oppfølging" count={data.actionItems.leadsNoFollowup} variant="warning" onClick={() => navigate("/sales/leads")} />
            <ActionItem label="Leads uten aktivitet >7d" count={data.actionItems.leadsInactive7d} variant="warning" onClick={() => navigate("/sales/leads")} />
            <ActionItem label="Tilbud ikke fulgt opp" count={data.actionItems.offersNotFollowed} variant="error" onClick={() => navigate("/sales/offers")} />
          </div>
        </SectionCard>

        <SectionCard title="Siste tilbud" subtitle="" icon={<ReceiptText className="h-4 w-4" />} action={<Button variant="ghost" size="sm" onClick={() => navigate("/sales/offers")} className="gap-1 text-xs h-7">Se alle <ArrowRight className="h-3 w-3" /></Button>}>
          <div className="space-y-1.5">
            {data.recentOffers.map((offer) => (
              <button
                key={offer.id}
                onClick={() => navigate("/sales/offers")}
                className="flex items-center gap-3 w-full rounded-xl p-2.5 text-left hover:bg-secondary/50 transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{offer.offer_number}</p>
                  <p className="text-xs text-muted-foreground truncate">{offer.customer}</p>
                </div>
                <span className="text-xs font-mono text-muted-foreground shrink-0">
                  kr {offer.total_inc_vat.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
                </span>
                <Badge className={OFFER_STATUS_CONFIG[offer.status]?.className + " text-[10px] rounded-full px-2 shrink-0"}>
                  {OFFER_STATUS_CONFIG[offer.status]?.label}
                </Badge>
              </button>
            ))}
            {data.recentOffers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Ingen tilbud ennå</p>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ── Shared Components ──

function KpiCard({ title, value, icon, variant, accent }: {
  title: string; value: number | string; icon: React.ReactNode;
  variant?: "default" | "warning" | "error"; accent?: boolean;
}) {
  const bgClass = variant === "error" ? "bg-destructive/[0.03]" : variant === "warning" ? "bg-status-ready-for-invoicing/[0.03]" : "bg-card";
  const iconClass = accent ? "text-primary" : variant === "error" ? "text-destructive" : variant === "warning" ? "text-status-ready-for-invoicing" : "text-muted-foreground";

  return (
    <div className={`rounded-2xl shadow-sm hover:shadow-md transition-shadow p-5 ${bgClass}`}>
      <div className={`flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-medium ${iconClass} mb-3`}>
        {icon}
        {title}
      </div>
      <p className="text-3xl font-bold text-foreground tracking-tight">{value}</p>
    </div>
  );
}

function SectionCard({ title, subtitle, icon, children, action }: {
  title: string; subtitle?: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl shadow-sm bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
            {icon} {title}
          </h3>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
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
    <div className="flex items-center justify-between py-2 px-3 rounded-xl">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant="outline" className="text-[10px] rounded-full bg-status-approved/10 text-status-approved border-status-approved/20">OK</Badge>
    </div>
  );

  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between w-full py-2 px-3 rounded-xl hover:bg-secondary/50 transition-colors focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <Badge
        className={`text-[10px] rounded-full px-2 ${
          variant === "error"
            ? "bg-destructive/10 text-destructive border-destructive/20"
            : "bg-status-ready-for-invoicing/10 text-status-ready-for-invoicing border-status-ready-for-invoicing/20"
        }`}
        variant="outline"
      >
        {count}
      </Badge>
    </button>
  );
}

function DonutChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-4">
      <div className="h-36 w-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <RPieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={36}
              outerRadius={56}
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
      <div className="space-y-1.5 min-w-0 flex-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-muted-foreground truncate flex-1">{d.name}</span>
            <span className="font-medium text-foreground">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
