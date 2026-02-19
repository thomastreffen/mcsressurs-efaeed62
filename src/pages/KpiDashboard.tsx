import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { nb } from "date-fns/locale";
import {
  CalendarDays, CheckCircle2, Clock, AlertTriangle, XCircle,
  TrendingUp, ArrowRight, Loader2, DollarSign, Target, BarChart3,
} from "lucide-react";
import { JOB_STATUS_CONFIG, type JobStatus } from "@/lib/job-status";
import { OFFER_STATUS_CONFIG, type OfferStatus } from "@/lib/offer-status";
import { useAuth } from "@/hooks/useAuth";

interface KpiData {
  // Operational
  totalActive: number;
  scheduledThisWeek: number;
  completedThisWeek: number;
  pendingChanges: number;
  rejected: number;
  techHours: { name: string; hours: number; color: string }[];
  recentJobs: { id: string; title: string; status: JobStatus; customer: string; internalNumber: string | null }[];
  // Sales (admin only)
  pipelineValue: number;
  wonThisMonth: number;
  conversionRate: number;
  recentOffers: { id: string; offer_number: string; status: OfferStatus; total_inc_vat: number; customer: string }[];
}

export default function KpiDashboard() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchKpi() {
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();

      const [eventsRes, techsRes, offersRes, leadsRes] = await Promise.all([
        supabase.from("events").select("id, title, status, customer, internal_number, start_time, end_time, event_technicians(technician_id, technicians(name, color))").order("start_time", { ascending: false }),
        supabase.from("technicians").select("id, name, color"),
        supabase.from("offers").select("*, calculations(customer_name, total_price)").order("created_at", { ascending: false }).limit(10),
        supabase.from("leads").select("estimated_value, probability").not("status", "in", '("lost","won")'),
      ]);

      const events = eventsRes.data || [];
      const techs = techsRes.data || [];

      const activeStatuses: JobStatus[] = ["requested", "approved", "scheduled", "in_progress", "time_change_proposed"];
      const totalActive = events.filter((e: any) => activeStatuses.includes(e.status)).length;

      const thisWeekEvents = events.filter((e: any) => {
        const start = new Date(e.start_time);
        return start >= weekStart && start <= weekEnd;
      });

      const scheduledThisWeek = thisWeekEvents.filter((e: any) => ["scheduled", "approved", "in_progress"].includes(e.status)).length;
      const completedThisWeek = thisWeekEvents.filter((e: any) => e.status === "completed").length;
      const pendingChanges = events.filter((e: any) => e.status === "time_change_proposed").length;
      const rejected = events.filter((e: any) => e.status === "rejected").length;

      const techHoursMap = new Map<string, { name: string; hours: number; color: string }>();
      for (const tech of techs) {
        techHoursMap.set(tech.id, { name: tech.name, hours: 0, color: tech.color || "#6366f1" });
      }
      for (const ev of thisWeekEvents) {
        const hours = (new Date(ev.end_time).getTime() - new Date(ev.start_time).getTime()) / 3600000;
        for (const et of (ev as any).event_technicians || []) {
          const entry = techHoursMap.get(et.technician_id);
          if (entry) entry.hours += hours;
        }
      }
      const techHours = Array.from(techHoursMap.values()).filter((t) => t.hours > 0).sort((a, b) => b.hours - a.hours);

      const recentJobs = events.slice(0, 8).map((e: any) => ({
        id: e.id, title: e.title, status: e.status as JobStatus, customer: e.customer || "", internalNumber: e.internal_number,
      }));

      // Sales KPIs
      const allOffers = offersRes.data || [];
      const monthOffers = allOffers.filter((o: any) => o.created_at >= monthStart && o.created_at <= monthEnd);
      const won = monthOffers.filter((o: any) => o.status === "accepted");
      const lost = monthOffers.filter((o: any) => o.status === "rejected");
      const wonThisMonth = won.reduce((s: number, o: any) => s + Number(o.total_inc_vat), 0);
      const decided = won.length + lost.length;
      const conversionRate = decided > 0 ? (won.length / decided) * 100 : 0;

      const pipelineLeads = (leadsRes.data || []).reduce((s: number, l: any) => s + (Number(l.estimated_value || 0) * (Number(l.probability || 50) / 100)), 0);
      const pipelineOffers = allOffers.filter((o: any) => o.status === "draft" || o.status === "sent").reduce((s: number, o: any) => s + Number(o.total_inc_vat), 0);

      const recentOffers = allOffers.slice(0, 5).map((o: any) => ({
        id: o.id, offer_number: o.offer_number, status: o.status as OfferStatus,
        total_inc_vat: Number(o.total_inc_vat), customer: o.calculations?.customer_name || "",
      }));

      setData({
        totalActive, scheduledThisWeek, completedThisWeek, pendingChanges, rejected, techHours, recentJobs,
        pipelineValue: pipelineLeads + pipelineOffers, wonThisMonth, conversionRate, recentOffers,
      });
      setLoading(false);
    }
    fetchKpi();
  }, []);

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Uke {format(new Date(), "w", { locale: nb })} · {format(new Date(), "MMMM yyyy", { locale: nb })}
        </p>
      </div>

      {/* Sales KPIs (admin only) */}
      {isAdmin && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard title="Pipeline (vektet)" value={`kr ${(data.pipelineValue / 1000).toFixed(0)}k`} icon={<BarChart3 className="h-4 w-4" />} accent="text-primary" />
          <KpiCard title="Vunnet denne mnd" value={`kr ${(data.wonThisMonth / 1000).toFixed(0)}k`} icon={<TrendingUp className="h-4 w-4" />} accent="text-status-completed" />
          <KpiCard title="Konverteringsrate" value={`${data.conversionRate.toFixed(0)}%`} icon={<Target className="h-4 w-4" />} accent="text-primary" />
          <KpiCard title="Aktive jobber" value={data.totalActive} icon={<CalendarDays className="h-4 w-4" />} accent="text-status-scheduled" />
        </div>
      )}

      {/* Operational KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {!isAdmin && <KpiCard title="Aktive jobber" value={data.totalActive} icon={<CalendarDays className="h-4 w-4" />} accent="text-primary" />}
        <KpiCard title="Planlagt denne uke" value={data.scheduledThisWeek} icon={<Clock className="h-4 w-4" />} accent="text-status-scheduled" />
        <KpiCard title="Fullførte denne uke" value={data.completedThisWeek} icon={<CheckCircle2 className="h-4 w-4" />} accent="text-status-completed" />
        <KpiCard title="Tidsendringer" value={data.pendingChanges} icon={<AlertTriangle className="h-4 w-4" />} accent="text-status-time-change-proposed" highlight={data.pendingChanges > 0} />
        <KpiCard title="Avslått" value={data.rejected} icon={<XCircle className="h-4 w-4" />} accent="text-destructive" highlight={data.rejected > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Tech hours */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Timer per montør denne uke
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.techHours.length > 0 ? (
              <div className="space-y-3">
                {data.techHours.map((tech) => (
                  <div key={tech.name} className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: tech.color }} />
                    <span className="text-sm flex-1">{tech.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((tech.hours / 40) * 100, 100)}%`, backgroundColor: tech.color }} />
                      </div>
                      <span className="text-sm font-medium w-12 text-right">{tech.hours.toFixed(1)}t</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Ingen planlagte timer denne uken.</p>
            )}
          </CardContent>
        </Card>

        {/* Recent jobs */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Siste jobber</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/jobs")} className="gap-1 text-xs">
                Se alle <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="flex items-center gap-3 w-full rounded-lg border p-2.5 text-left hover:bg-secondary/50 hover:border-primary/20 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{job.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {job.internalNumber && `${job.internalNumber} · `}{job.customer}
                    </p>
                  </div>
                  <Badge
                    className="shrink-0 text-[10px]"
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
          </CardContent>
        </Card>

        {/* Recent offers (admin) */}
        {isAdmin && data.recentOffers.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Siste tilbud
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => navigate("/sales/offers")} className="gap-1 text-xs">
                  Se alle <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {data.recentOffers.map((offer) => (
                  <button
                    key={offer.id}
                    onClick={() => navigate("/sales/offers")}
                    className="flex items-center gap-3 rounded-lg border p-2.5 text-left hover:bg-secondary/50 hover:border-primary/20 transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{offer.offer_number}</p>
                      <p className="text-xs text-muted-foreground truncate">{offer.customer}</p>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground shrink-0">
                      kr {offer.total_inc_vat.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
                    </span>
                    <Badge className={OFFER_STATUS_CONFIG[offer.status]?.className + " text-[10px] shrink-0"}>
                      {OFFER_STATUS_CONFIG[offer.status]?.label}
                    </Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon, accent, highlight }: { title: string; value: number | string; icon: React.ReactNode; accent: string; highlight?: boolean }) {
  return (
    <Card className={`transition-all hover:shadow-sm ${highlight ? "border-destructive/30" : ""}`}>
      <CardContent className="p-4">
        <div className={`flex items-center gap-2 text-xs ${accent} mb-1`}>
          {icon}
          {title}
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
