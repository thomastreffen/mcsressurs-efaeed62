import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CalendarCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Unplug,
} from "lucide-react";

interface CalendarLink {
  id: string;
  technician_id: string;
  user_id: string;
  calendar_event_id: string | null;
  calendar_event_url: string | null;
  sync_status: string;
  last_synced_at: string | null;
  last_error: string | null;
  technician_name?: string;
}

interface AvailabilityResult {
  technician_id: string;
  user_id: string;
  name: string;
  busy: boolean;
  busy_slots: { status: string; subject: string | null; start: string; end: string; is_private: boolean }[];
}

interface JobCalendarSyncProps {
  jobId: string;
  jobStart: Date;
  jobEnd: Date;
  technicianIds: string[];
  isAdmin: boolean;
}

const SYNC_STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  linked: { label: "Synkronisert", icon: CheckCircle2, className: "text-[hsl(var(--status-approved))]" },
  failed: { label: "Feilet", icon: XCircle, className: "text-destructive" },
  unlinked: { label: "Ikke koblet", icon: Unplug, className: "text-muted-foreground" },
};

export function JobCalendarSync({ jobId, jobStart, jobEnd, technicianIds, isAdmin }: JobCalendarSyncProps) {
  const [links, setLinks] = useState<CalendarLink[]>([]);
  const [availability, setAvailability] = useState<AvailabilityResult[] | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [loadingLinks, setLoadingLinks] = useState(true);

  const fetchLinks = useCallback(async () => {
    setLoadingLinks(true);
    const { data } = await supabase
      .from("job_calendar_links")
      .select("*, technicians(name)")
      .eq("job_id", jobId);

    setLinks(
      (data || []).map((d: any) => ({
        ...d,
        technician_name: d.technicians?.name || "Ukjent",
      }))
    );
    setLoadingLinks(false);
  }, [jobId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  // Get user_ids for current technicians
  const [techUserMap, setTechUserMap] = useState<Map<string, { user_id: string; name: string }>>(new Map());
  useEffect(() => {
    if (!technicianIds.length) return;
    supabase
      .from("technicians")
      .select("id, user_id, name")
      .in("id", technicianIds)
      .then(({ data }) => {
        const map = new Map<string, { user_id: string; name: string }>();
        for (const t of data || []) {
          map.set(t.id, { user_id: t.user_id, name: t.name });
        }
        setTechUserMap(map);
      });
  }, [technicianIds]);

  const checkAvailability = async () => {
    const userIds = Array.from(techUserMap.values()).map((t) => t.user_id);
    if (!userIds.length) {
      toast.error("Ingen teknikere å sjekke");
      return;
    }

    setLoadingAvail(true);
    setAvailability(null);
    try {
      const { data, error } = await supabase.functions.invoke("ms-calendar", {
        body: {
          action: "availability",
          user_ids: userIds,
          start: jobStart.toISOString(),
          end: jobEnd.toISOString(),
        },
      });
      if (error) throw error;
      setAvailability(data.results || []);
      if (data.results?.some((r: AvailabilityResult) => r.busy)) {
        toast.warning("Noen teknikere har konflikter i dette tidsrommet");
      } else {
        toast.success("Alle teknikere er ledige!");
      }
    } catch (e: any) {
      toast.error("Kunne ikke sjekke tilgjengelighet", { description: e.message });
    } finally {
      setLoadingAvail(false);
    }
  };

  const syncToOutlook = async () => {
    setSyncing(true);
    try {
      const userIds = Array.from(techUserMap.values()).map((t) => t.user_id);
      const { data, error } = await supabase.functions.invoke("ms-calendar", {
        body: { action: "upsert_job_events", job_id: jobId, user_ids: userIds },
      });
      if (error) throw error;
      const successCount = (data.results || []).filter((r: any) => r.status !== "failed").length;
      toast.success(`Outlook synkronisert`, { description: `${successCount}/${data.results?.length || 0} teknikere` });
      fetchLinks();
    } catch (e: any) {
      toast.error("Synk feilet", { description: e.message });
    } finally {
      setSyncing(false);
    }
  };

  const unlinkTechnician = async (userId: string) => {
    setUnlinking(userId);
    try {
      const { error } = await supabase.functions.invoke("ms-calendar", {
        body: { action: "unlink_job_events", job_id: jobId, user_ids: [userId] },
      });
      if (error) throw error;
      toast.success("Outlook-hendelse fjernet");
      fetchLinks();
    } catch (e: any) {
      toast.error("Feil ved fjerning", { description: e.message });
    } finally {
      setUnlinking(null);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <CalendarCheck className="h-4 w-4" />
          Outlook-kalender
        </h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={checkAvailability}
            disabled={loadingAvail || !technicianIds.length}
            className="gap-1.5"
          >
            {loadingAvail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sjekk tilgjengelighet
          </Button>
          <Button
            size="sm"
            onClick={syncToOutlook}
            disabled={syncing || !technicianIds.length}
            className="gap-1.5"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarCheck className="h-3.5 w-3.5" />}
            Synk til Outlook
          </Button>
        </div>
      </div>

      {/* Availability results */}
      {availability && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tilgjengelighet</p>
          {availability.map((r) => (
            <div
              key={r.technician_id}
              className={`flex items-center justify-between rounded-md border p-2.5 ${
                r.busy ? "border-destructive/30 bg-destructive/5" : "border-[hsl(var(--status-approved))]/30 bg-[hsl(var(--status-approved))]/5"
              }`}
            >
              <div className="flex items-center gap-2">
                {r.busy ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-approved))]" />
                )}
                <span className="text-sm font-medium">{r.name}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {r.busy
                  ? `${r.busy_slots.length} konflikt(er)`
                  : "Ledig"}
              </div>
            </div>
          ))}
          {availability.some((r) => r.busy) && (
            <div className="space-y-1">
              {availability
                .filter((r) => r.busy)
                .flatMap((r) =>
                  r.busy_slots.map((s, i) => (
                    <p key={`${r.technician_id}-${i}`} className="text-xs text-muted-foreground pl-6">
                      {r.name}: {s.is_private ? "Privat avtale" : s.subject || "Opptatt"},{" "}
                      {new Date(s.start).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}–
                      {new Date(s.end).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  ))
                )}
            </div>
          )}
        </div>
      )}

      {/* Sync status per technician */}
      {!loadingLinks && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Synk-status</p>
          {technicianIds.map((tid) => {
            const techInfo = techUserMap.get(tid);
            const link = links.find((l) => l.technician_id === tid);
            const config = SYNC_STATUS_CONFIG[link?.sync_status || "unlinked"] || SYNC_STATUS_CONFIG.unlinked;
            const Icon = config.icon;

            return (
              <div key={tid} className="flex items-center justify-between rounded-md border p-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={`h-4 w-4 shrink-0 ${config.className}`} />
                  <span className="text-sm font-medium truncate">{link?.technician_name || techInfo?.name || tid.slice(0, 8)}</span>
                  <Badge variant="outline" className="text-xs shrink-0">{config.label}</Badge>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {link?.last_synced_at && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {new Date(link.last_synced_at).toLocaleString("nb-NO", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  )}
                  {link?.calendar_event_url && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => window.open(link.calendar_event_url!, "_blank")}
                      title="Åpne i Outlook"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {link?.sync_status === "linked" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      disabled={unlinking === techInfo?.user_id}
                      onClick={() => techInfo && unlinkTechnician(techInfo.user_id)}
                      title="Fjern Outlook-hendelse"
                    >
                      {unlinking === techInfo?.user_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Unplug className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Show errors */}
          {links.filter((l) => l.sync_status === "failed" && l.last_error).map((l) => (
            <div key={l.id} className="rounded-md bg-destructive/5 border border-destructive/20 p-2.5">
              <p className="text-xs text-destructive">
                <span className="font-medium">{l.technician_name}:</span> {l.last_error}
              </p>
            </div>
          ))}
        </div>
      )}

      {loadingLinks && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laster synk-status...
        </div>
      )}
    </div>
  );
}
