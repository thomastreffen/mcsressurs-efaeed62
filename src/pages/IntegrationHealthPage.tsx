import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CalendarCheck, AlertTriangle, Unplug, MailWarning, Loader2,
  RefreshCw, ExternalLink, Send, ChevronDown, ChevronUp, ShieldAlert,
  Wrench, Activity, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

// ── Types ──

interface KpiData {
  dirtyJobs: number;
  failedLinks: number;
  disconnectedTechs: number;
  failedEmails7d: number;
}

interface ErrorGroup {
  error_code: string;
  count: number;
  links: FailedLink[];
}

interface FailedLink {
  id: string;
  job_id: string;
  technician_id: string;
  sync_status: string;
  last_error: string | null;
  job_title: string;
  tech_name: string;
  tech_user_id: string;
  error_code: string;
}

interface DisconnectedTech {
  id: string;
  name: string;
  email: string;
  user_id: string;
  last_notified_at: string | null;
}

interface AuditEntry {
  id: string;
  job_id: string;
  action: string;
  performed_by: string;
  started_at: string;
  finished_at: string | null;
  technicians_count: number;
  successes_count: number;
  failures_count: number;
  override_conflicts: boolean;
}

export default function IntegrationHealthPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<KpiData>({ dirtyJobs: 0, failedLinks: 0, disconnectedTechs: 0, failedEmails7d: 0 });
  const [errorGroups, setErrorGroups] = useState<ErrorGroup[]>([]);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState<DisconnectedTech[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [notifying, setNotifying] = useState<string | null>(null);
  const [bulkRepairing, setBulkRepairing] = useState(false);
  const [bulkNotifying, setBulkNotifying] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Dirty jobs count
      const { count: dirtyCount } = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("calendar_dirty", true)
        .is("deleted_at", null);

      // 2. Failed calendar links
      const { data: failedLinksData } = await supabase
        .from("job_calendar_links")
        .select("id, job_id, technician_id, user_id, sync_status, last_error")
        .eq("sync_status", "failed");

      // 3. Failed emails last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: failedEmailCount } = await supabase
        .from("communication_logs")
        .select("id", { count: "exact", head: true })
        .eq("mode", "failed")
        .eq("direction", "outbound")
        .gte("created_at", sevenDaysAgo);

      // 4. All technicians to check MS connection
      const { data: allTechs } = await supabase
        .from("technicians")
        .select("id, name, email, user_id");

      // Check connection status via ms-debug for each tech
      // For efficiency, we check which techs have tokens by looking at who has linked calendar entries
      const techsWithLinks = new Set((failedLinksData || []).map(l => l.technician_id));
      const { data: linkedTechs } = await supabase
        .from("job_calendar_links")
        .select("user_id")
        .eq("sync_status", "linked");
      const connectedUserIds = new Set((linkedTechs || []).map(l => l.user_id));

      // Also check techs assigned to jobs who have no calendar links at all
      const { data: assignedTechs } = await supabase
        .from("event_technicians")
        .select("technician_id");
      const assignedTechIds = new Set((assignedTechs || []).map(a => a.technician_id));

      // Disconnected = assigned techs whose user_id has no linked entries and has failed/missing links
      const disconnectedList: DisconnectedTech[] = [];
      for (const tech of (allTechs || [])) {
        if (!assignedTechIds.has(tech.id)) continue;
        if (connectedUserIds.has(tech.user_id)) continue;
        // Check for recent notification
        const { data: recentNotif } = await supabase
          .from("notifications")
          .select("created_at")
          .eq("user_id", tech.user_id)
          .eq("type", "ms_connect_request")
          .order("created_at", { ascending: false })
          .limit(1);
        disconnectedList.push({
          ...tech,
          last_notified_at: recentNotif?.[0]?.created_at || null,
        });
      }

      // 5. Build error groups from failed links
      const groups: Record<string, FailedLink[]> = {};
      if (failedLinksData && failedLinksData.length > 0) {
        // Fetch job titles and tech names
        const jobIds = [...new Set(failedLinksData.map(l => l.job_id))];
        const techIds = [...new Set(failedLinksData.map(l => l.technician_id))];

        const { data: jobs } = await supabase
          .from("events")
          .select("id, title")
          .in("id", jobIds);
        const { data: techs } = await supabase
          .from("technicians")
          .select("id, name, user_id")
          .in("id", techIds);

        const jobMap = Object.fromEntries((jobs || []).map(j => [j.id, j.title]));
        const techMap = Object.fromEntries((techs || []).map(t => [t.id, { name: t.name, user_id: t.user_id }]));

        for (const link of failedLinksData) {
          const errCode = (() => {
            try {
              if (!link.last_error) return "unknown";
              const parsed = typeof link.last_error === "string" ? JSON.parse(link.last_error) : link.last_error;
              return (parsed as any)?.error_code || "unknown";
            } catch {
              return "unknown";
            }
          })();

          if (!groups[errCode]) groups[errCode] = [];
          groups[errCode].push({
            id: link.id,
            job_id: link.job_id,
            technician_id: link.technician_id,
            sync_status: link.sync_status,
            last_error: link.last_error as string | null,
            job_title: jobMap[link.job_id] || "Ukjent jobb",
            tech_name: techMap[link.technician_id]?.name || "Ukjent",
            tech_user_id: techMap[link.technician_id]?.user_id || "",
            error_code: errCode,
          });
        }
      }

      // 6. Audit feed
      const { data: auditData } = await supabase
        .from("job_calendar_audit")
        .select("id, job_id, action, performed_by, started_at, finished_at, technicians_count, successes_count, failures_count, override_conflicts")
        .order("started_at", { ascending: false })
        .limit(20);

      setKpi({
        dirtyJobs: dirtyCount || 0,
        failedLinks: (failedLinksData || []).length,
        disconnectedTechs: disconnectedList.length,
        failedEmails7d: failedEmailCount || 0,
      });
      setErrorGroups(
        Object.entries(groups).map(([code, links]) => ({
          error_code: code,
          count: links.length,
          links,
        })).sort((a, b) => b.count - a.count)
      );
      setDisconnected(disconnectedList);
      setAuditLog((auditData || []) as AuditEntry[]);
    } catch (err) {
      console.error("[IntegrationHealth] Fetch error:", err);
      toast.error("Kunne ikke laste integrasjonsstatus");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Actions ──

  const handleNotifyTech = async (techUserId: string, techName: string) => {
    setNotifying(techUserId);
    try {
      // Check throttle (2h)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", techUserId)
        .eq("type", "ms_connect_request")
        .gte("created_at", twoHoursAgo)
        .limit(1);

      if (recent && recent.length > 0) {
        toast.info(`${techName} ble allerede varslet nylig`);
        return;
      }

      await supabase.from("notifications").insert({
        user_id: techUserId,
        type: "ms_connect_request",
        title: "Koble Microsoft 365",
        message: "Administrator ber deg koble Microsoft-kontoen din for kalender- og e-postsynkronisering. Gå til Integrasjoner for å koble til.",
      });
      toast.success(`Varsel sendt til ${techName}`);
      fetchAll();
    } catch {
      toast.error("Kunne ikke sende varsel");
    } finally {
      setNotifying(null);
    }
  };

  const handleBulkNotifyMissingToken = async () => {
    setBulkNotifying(true);
    try {
      const missingTokenLinks = errorGroups.find(g => g.error_code === "missing_token")?.links || [];
      const uniqueUsers = [...new Map(missingTokenLinks.map(l => [l.tech_user_id, l.tech_name])).entries()];
      let sent = 0;
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      for (const [userId, name] of uniqueUsers) {
        const { data: recent } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("type", "ms_connect_request")
          .gte("created_at", twoHoursAgo)
          .limit(1);
        if (recent && recent.length > 0) continue;

        await supabase.from("notifications").insert({
          user_id: userId,
          type: "ms_connect_request",
          title: "Koble Microsoft 365",
          message: "Administrator ber deg koble Microsoft-kontoen din for kalender- og e-postsynkronisering.",
        });
        sent++;
      }
      toast.success(`Sendt ${sent} varsler (${uniqueUsers.length - sent} allerede varslet)`);
      fetchAll();
    } catch {
      toast.error("Feil ved massevarsling");
    } finally {
      setBulkNotifying(false);
    }
  };

  const handleBulkRepairItemNotFound = async () => {
    setBulkRepairing(true);
    try {
      const itemNotFoundLinks = errorGroups.find(g => g.error_code === "itemNotFound" || g.error_code === "item_not_found")?.links || [];
      if (itemNotFoundLinks.length === 0) {
        toast.info("Ingen itemNotFound-feil å reparere");
        return;
      }

      let repaired = 0;
      for (const link of itemNotFoundLinks) {
        const { error } = await supabase
          .from("job_calendar_links")
          .update({ sync_status: "unlinked", calendar_event_id: null, calendar_event_url: null, last_error: null })
          .eq("id", link.id);
        if (!error) repaired++;
      }

      // Mark jobs as dirty so next sync recreates events
      const jobIds = [...new Set(itemNotFoundLinks.map(l => l.job_id))];
      for (const jobId of jobIds) {
        await supabase.from("events").update({ calendar_dirty: true }).eq("id", jobId);
      }

      toast.success(`Reparert ${repaired} koblinger. Jobbene er markert for resynk.`);
      fetchAll();
    } catch {
      toast.error("Feil ved reparasjon");
    } finally {
      setBulkRepairing(false);
    }
  };

  // ── Error code labels ──
  const errorLabels: Record<string, string> = {
    missing_token: "Mangler Microsoft-tilkobling",
    invalid_grant: "Token utløpt / ugyldig",
    item_not_found: "Outlook-event slettet",
    itemNotFound: "Outlook-event slettet",
    insufficient_privileges: "Mangler rettigheter",
    throttled: "Rate-limited av Graph",
    unknown: "Ukjent feil",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Integrasjonshelse</h1>
          <p className="text-sm text-muted-foreground">Oversikt over Microsoft-integrasjoner for kalender og e-post</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchAll}>
          <RefreshCw className="h-3.5 w-3.5" /> Oppdater
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Ventende synk"
          value={kpi.dirtyJobs}
          icon={<CalendarCheck className="h-4 w-4" />}
          variant={kpi.dirtyJobs > 0 ? "warning" : "ok"}
          description="Jobber med endringer"
        />
        <KpiCard
          title="Feilede koblinger"
          value={kpi.failedLinks}
          icon={<AlertTriangle className="h-4 w-4" />}
          variant={kpi.failedLinks > 0 ? "error" : "ok"}
          description="Calendar links failed"
        />
        <KpiCard
          title="Uten Microsoft"
          value={kpi.disconnectedTechs}
          icon={<Unplug className="h-4 w-4" />}
          variant={kpi.disconnectedTechs > 0 ? "warning" : "ok"}
          description="Teknikere som mangler tilkobling"
        />
        <KpiCard
          title="E-post feil (7d)"
          value={kpi.failedEmails7d}
          icon={<MailWarning className="h-4 w-4" />}
          variant={kpi.failedEmails7d > 0 ? "error" : "ok"}
          description="Feilede sendinger siste 7 dager"
        />
      </div>

      {/* Bulk Actions */}
      {(errorGroups.some(g => g.error_code === "missing_token") || errorGroups.some(g => g.error_code === "item_not_found" || g.error_code === "itemNotFound")) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Hurtighandlinger
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {errorGroups.some(g => g.error_code === "item_not_found" || g.error_code === "itemNotFound") && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleBulkRepairItemNotFound}
                disabled={bulkRepairing}
              >
                {bulkRepairing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                Reparer alle itemNotFound ({errorGroups.find(g => g.error_code === "item_not_found" || g.error_code === "itemNotFound")?.count || 0})
              </Button>
            )}
            {errorGroups.some(g => g.error_code === "missing_token") && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleBulkNotifyMissingToken}
                disabled={bulkNotifying}
              >
                {bulkNotifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Varsle alle missing_token ({errorGroups.find(g => g.error_code === "missing_token")?.count || 0} koblinger)
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Feilfordeling – Kalenderkoblinger
          </CardTitle>
        </CardHeader>
        <CardContent>
          {errorGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Ingen feilede koblinger 🎉</p>
          ) : (
            <div className="space-y-2">
              {errorGroups.map(group => {
                const isExpanded = expandedGroup === group.error_code;
                return (
                  <div key={group.error_code} className="border rounded-lg">
                    <button
                      type="button"
                      onClick={() => setExpandedGroup(isExpanded ? null : group.error_code)}
                      className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="text-xs">{group.count}</Badge>
                        <span className="text-sm font-medium">{errorLabels[group.error_code] || group.error_code}</span>
                        <Badge variant="outline" className="text-[10px] font-mono">{group.error_code}</Badge>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    {isExpanded && (
                      <div className="border-t p-3 space-y-2">
                        {group.links.map(link => (
                          <div key={link.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{link.job_title}</p>
                              <p className="text-xs text-muted-foreground">{link.tech_name}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => navigate(`/jobs/${link.job_id}`)}
                              >
                                <ExternalLink className="h-3 w-3" /> Åpne jobb
                              </Button>
                              {group.error_code === "missing_token" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1"
                                  onClick={() => handleNotifyTech(link.tech_user_id, link.tech_name)}
                                  disabled={notifying === link.tech_user_id}
                                >
                                  {notifying === link.tech_user_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                  Varsle
                                </Button>
                              )}
                              {(group.error_code === "item_not_found" || group.error_code === "itemNotFound") && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1"
                                  onClick={async () => {
                                    await supabase.from("job_calendar_links").update({
                                      sync_status: "unlinked", calendar_event_id: null, calendar_event_url: null, last_error: null,
                                    }).eq("id", link.id);
                                    await supabase.from("events").update({ calendar_dirty: true }).eq("id", link.job_id);
                                    toast.success("Koblingen er tilbakestilt for resynk");
                                    fetchAll();
                                  }}
                                >
                                  <Wrench className="h-3 w-3" /> Reparer
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disconnected Technicians */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Unplug className="h-4 w-4" /> Teknikere uten Microsoft-tilkobling
          </CardTitle>
        </CardHeader>
        <CardContent>
          {disconnected.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Alle tildelte teknikere er tilkoblet 🎉</p>
          ) : (
            <div className="space-y-2">
              {disconnected.map(tech => (
                <div key={tech.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{tech.name}</p>
                    <p className="text-xs text-muted-foreground">{tech.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {tech.last_notified_at && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Varslet {formatDistanceToNow(new Date(tech.last_notified_at), { addSuffix: true, locale: nb })}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleNotifyTech(tech.user_id, tech.name)}
                      disabled={notifying === tech.user_id}
                    >
                      {notifying === tech.user_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Varsle
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Feed */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Synkroniseringslogg
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditLog.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Ingen synkroniseringsaktivitet registrert</p>
          ) : (
            <div className="space-y-2">
              {auditLog.map(entry => (
                <div key={entry.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] font-mono">{entry.action}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(entry.started_at), "d. MMM HH:mm", { locale: nb })}
                      </span>
                      {entry.override_conflicts && (
                        <Badge variant="secondary" className="text-[10px]">Override</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {entry.technicians_count} tekniker(e) · {entry.successes_count} ok · {entry.failures_count} feil
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 shrink-0"
                    onClick={() => navigate(`/jobs/${entry.job_id}`)}
                  >
                    <ExternalLink className="h-3 w-3" /> Jobb
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── KPI Card Component ──

function KpiCard({ title, value, icon, variant, description }: {
  title: string;
  value: number;
  icon: React.ReactNode;
  variant: "ok" | "warning" | "error";
  description: string;
}) {
  const bgClass = variant === "ok"
    ? "bg-card"
    : variant === "warning"
    ? "bg-yellow-500/5 border-yellow-500/20"
    : "bg-destructive/5 border-destructive/20";

  const valueClass = variant === "ok"
    ? "text-foreground"
    : variant === "warning"
    ? "text-yellow-600 dark:text-yellow-400"
    : "text-destructive";

  return (
    <Card className={bgClass}>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium">{title}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}
