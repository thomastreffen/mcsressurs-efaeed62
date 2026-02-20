import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { OFFER_STATUS_CONFIG, type OfferStatus } from "@/lib/offer-status";

import { JobStatusBadge } from "@/components/JobStatusBadge";
import { AttendeeStatusList } from "@/components/AttendeeStatusList";
import { AuditInfo } from "@/components/AuditInfo";
import { EditJobDialog } from "@/components/EditJobDialog";
import { ImageLightbox } from "@/components/ImageLightbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Job, Attachment } from "@/lib/mock-data";
import {
  JOB_STATUS_CONFIG,
  ALL_STATUSES,
  canSetStatus,
  getDisplayNumber,
  type JobStatus,
} from "@/lib/job-status";
import { useAuth } from "@/hooks/useAuth";
import { JobCalendarSync } from "@/components/JobCalendarSync";
import { EmailComposer } from "@/components/EmailComposer";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Clock,
  Users,
  Loader2,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Unplug,
  CalendarCheck,
  Download,
  Trash2,
  Pencil,
  Video,
  Copy,
  ExternalLink,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { OutlookSyncStatus } from "@/lib/mock-data";

/* ─── Sync Status Badge ─── */
const SYNC_STATUS_MAP: Record<string, { label: string; variant: "ok" | "warn" | "error" | "muted" }> = {
  not_synced: { label: "Ikke synkronisert", variant: "muted" },
  synced: { label: "OK", variant: "ok" },
  missing_in_outlook: { label: "Mangler", variant: "warn" },
  failed: { label: "Feil", variant: "error" },
  cancelled: { label: "Kansellert", variant: "muted" },
  restored: { label: "Gjenopprettet", variant: "ok" },
};

const syncBadgeClasses: Record<string, string> = {
  ok: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  warn: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  error: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  muted: "bg-muted text-muted-foreground border-border",
};

function SyncBadge({ status }: { status?: OutlookSyncStatus }) {
  const config = SYNC_STATUS_MAP[status || "not_synced"] || SYNC_STATUS_MAP.not_synced;
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${syncBadgeClasses[config.variant]}`}>
      {config.label}
    </span>
  );
}

/* ─── Card wrapper ─── */
function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border/60 bg-card shadow-sm p-5 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
      {icon}
      {children}
    </h3>
  );
}

/* ─── Event log type ─── */
interface EventLog {
  id: string;
  action_type: string;
  change_summary: string | null;
  performed_by: string | null;
  timestamp: string;
}

/* ═══════════════════════════════════════════════════════════════ */
export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [technicianNames, setTechnicianNames] = useState<string[]>([]);
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [syncLoading, setSyncLoading] = useState<string | null>(null);
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [offerData, setOfferData] = useState<any>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  /* ── Outlook legacy action ── */
  const handleOutlookAction = async (syncAction: string) => {
    if (!job || !user) return;
    setSyncLoading(syncAction);
    try {
      const res = await supabase.functions.invoke("outlook-sync", {
        body: { action: syncAction, event_id: job.id, performed_by: user.id },
      });
      if (res.error) {
        toast.error("Outlook-handling feilet", { description: String(res.error) });
      } else {
        const msg = syncAction === "resync" ? "Outlook resynkronisert"
          : syncAction === "delete_outlook" ? "Outlook-event slettet"
          : syncAction === "disconnect" ? "Outlook-kobling fjernet"
          : syncAction === "check_and_restore" ? "Sync-sjekk fullført"
          : "Handling utført";
        toast.success(msg);
        fetchJob();
        fetchLogs();
      }
    } catch (err) {
      toast.error("Feil ved Outlook-handling");
    }
    setSyncLoading(null);
  };

  /* ── Fetch data ── */
  const fetchJob = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("events")
      .select(`
        *,
        event_technicians (
          technician_id,
          technicians ( id, name, color )
        )
      `)
      .eq("id", id)
      .single();

    if (error || !data) {
      setJob(null);
      setLoading(false);
      return;
    }

    const techs = (data.event_technicians ?? [])
      .filter((et: any) => et.technicians)
      .map((et: any) => et.technicians);

    setTechnicianNames(techs.map((t: any) => t.name));

    setJob({
      id: data.id,
      microsoftEventId: data.microsoft_event_id ?? "",
      technicianIds: (data.event_technicians ?? []).map((et: any) => et.technician_id),
      attendeeStatuses: [],
      title: data.title,
      customer: data.customer ?? "",
      address: data.address ?? "",
      description: data.description ?? "",
      start: new Date(data.start_time),
      end: new Date(data.end_time),
      status: data.status as JobStatus,
      jobNumber: data.job_number,
      internalNumber: data.internal_number,
      proposedStart: data.proposed_start ? new Date(data.proposed_start) : undefined,
      proposedEnd: data.proposed_end ? new Date(data.proposed_end) : undefined,
      createdAt: data.created_at ? new Date(data.created_at) : undefined,
      updatedAt: data.updated_at ? new Date(data.updated_at) : undefined,
      attachments: Array.isArray(data.attachments) ? (data.attachments as unknown as Attachment[]) : [],
      outlookSyncStatus: (data.outlook_sync_status as OutlookSyncStatus) || "not_synced",
      outlookLastSyncedAt: data.outlook_last_synced_at ? new Date(data.outlook_last_synced_at) : undefined,
      outlookDeletedAt: data.outlook_deleted_at ? new Date(data.outlook_deleted_at) : undefined,
      calendarDirty: data.calendar_dirty || false,
      calendarLastSyncedAt: data.calendar_last_synced_at || null,
      meetingJoinUrl: data.meeting_join_url || null,
      meetingId: data.meeting_id || null,
      meetingCreatedAt: data.meeting_created_at ? new Date(data.meeting_created_at) : null,
    });
    setLoading(false);
  }, [id]);

  const fetchLogs = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("event_logs")
      .select("*")
      .eq("event_id", id)
      .order("timestamp", { ascending: false });
    if (data) setLogs(data);
  }, [id]);

  useEffect(() => {
    fetchJob();
    fetchLogs();
    if (id) {
      supabase.from("events").select("offer_id").eq("id", id).single().then(({ data }) => {
        if (data?.offer_id) {
          supabase.from("offers").select("*, calculations(customer_name, project_title)").eq("id", data.offer_id).single().then(({ data: offer }) => {
            if (offer) setOfferData(offer);
          });
        }
      });
    }
  }, [fetchJob, fetchLogs, id]);

  /* ── Status change ── */
  const handleStatusChange = async (newStatus: JobStatus) => {
    if (!job || !user) return;
    if (!canSetStatus(user.role, newStatus)) {
      toast.error("Du har ikke tilgang til å sette denne statusen");
      return;
    }
    setStatusUpdating(true);
    const { error } = await supabase
      .from("events")
      .update({ status: newStatus, updated_by: user.id })
      .eq("id", job.id);
    if (error) {
      toast.error("Kunne ikke oppdatere status", { description: error.message });
    } else {
      await supabase.from("event_logs").insert({
        event_id: job.id,
        action_type: "status_changed",
        performed_by: user.id,
        change_summary: `Status endret fra "${JOB_STATUS_CONFIG[job.status].label}" til "${JOB_STATUS_CONFIG[newStatus].label}"`,
      });
      setJob((prev) => prev ? { ...prev, status: newStatus } : null);
      toast.success("Status oppdatert", { description: JOB_STATUS_CONFIG[newStatus].label });
      fetchLogs();
    }
    setStatusUpdating(false);
  };

  /* ── Attachment delete ── */
  const handleDeleteAttachment = async (attachmentName: string) => {
    if (!job || !isAdmin) return;
    const updated = (job.attachments ?? []).filter((a) => a.name !== attachmentName);
    const { error } = await supabase
      .from("events")
      .update({ attachments: updated as any })
      .eq("id", job.id);
    if (error) {
      toast.error("Kunne ikke slette vedlegg");
    } else {
      setJob((prev) => prev ? { ...prev, attachments: updated } : null);
      toast.success("Vedlegg slettet");
    }
  };

  /* ── Create Teams meeting ── */
  const handleCreateMeeting = async () => {
    if (!user || !job) return;
    setMeetingLoading(true);
    try {
      const res = await supabase.functions.invoke("teams-meeting", {
        body: { action: "create", job_id: job.id },
      });
      if (res.error || res.data?.error) {
        const errMsg = res.data?.error || String(res.error);
        if (res.data?.ms_reauth) {
          toast.error("Microsoft-tilkobling kreves", { description: "Logg inn på nytt via Microsoft." });
        } else {
          toast.error("Kunne ikke opprette møte", { description: errMsg });
        }
      } else {
        toast.success("Teams-møte opprettet");
        fetchJob();
        fetchLogs();
      }
    } catch {
      toast.error("Feil ved opprettelse av Teams-møte");
    }
    setMeetingLoading(false);
  };

  /* ── Loading / not found ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold">Jobb ikke funnet</p>
          <Button variant="outline" onClick={() => navigate("/jobs")}>Tilbake til jobber</Button>
        </div>
      </div>
    );
  }

  const displayNumber = getDisplayNumber(job.jobNumber ?? null, job.internalNumber ?? null);
  const role = user?.role ?? "montør";
  const attachments = job.attachments ?? [];
  const imageAttachments = attachments.filter((a) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(a.name));
  const docAttachments = attachments.filter((a) => !/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(a.name));

  return (
    <>
      <div className="min-h-screen bg-[hsl(210,20%,98%)] dark:bg-background">
        {/* ═══ Sticky Header ═══ */}
        <div className="sticky top-0 z-30 border-b border-border/50 bg-card/80 backdrop-blur-xl">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              {/* Left: back + job info */}
              <div className="flex items-start gap-3 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/")}
                  className="shrink-0 mt-0.5 rounded-xl h-9 w-9"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">
                      {displayNumber}
                    </h1>
                    <JobStatusBadge status={job.status} />
                    {job.calendarDirty && (
                      <span className="inline-flex items-center rounded-md bg-orange-50 border border-orange-200 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800">
                        Usynkronisert
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {job.customer}
                    </span>
                    {job.address && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.address}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {format(job.start, "d. MMM", { locale: nb })} {format(job.start, "HH:mm")}–{format(job.end, "HH:mm")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Status select */}
                <div className="hidden sm:block w-44">
                  <Select
                    value={job.status}
                    onValueChange={(v) => handleStatusChange(v as JobStatus)}
                    disabled={statusUpdating}
                  >
                    <SelectTrigger className="h-9 rounded-xl text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_STATUSES.filter((s) => canSetStatus(role, s)).map((s) => (
                        <SelectItem key={s} value={s}>{JOB_STATUS_CONFIG[s].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setEditOpen(true)} className="gap-2">
                        <Pencil className="h-3.5 w-3.5" /> Rediger jobb
                      </DropdownMenuItem>
                      {job.microsoftEventId && (
                        <>
                          <DropdownMenuItem onClick={() => handleOutlookAction("resync")} disabled={!!syncLoading} className="gap-2">
                            <RefreshCw className="h-3.5 w-3.5" /> Resync Outlook
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOutlookAction("disconnect")} disabled={!!syncLoading} className="gap-2">
                            <Unplug className="h-3.5 w-3.5" /> Koble fra Outlook
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Proposed time-change banner ═══ */}
        {job.status === "time_change_proposed" && job.proposedStart && job.proposedEnd && (
          <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-5">
            <div className="rounded-2xl border border-orange-200 bg-orange-50/70 dark:border-orange-800 dark:bg-orange-950/40 p-4 space-y-2">
              <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                ⚠️ Foreslått nytt tidspunkt
              </p>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                {format(job.proposedStart, "EEEE d. MMMM yyyy", { locale: nb })},{" "}
                {format(job.proposedStart, "HH:mm")} – {format(job.proposedEnd, "HH:mm")}
              </p>
              {isAdmin && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="rounded-xl"
                    onClick={async () => {
                      await supabase.from("events").update({
                        start_time: job.proposedStart!.toISOString(),
                        end_time: job.proposedEnd!.toISOString(),
                        proposed_start: null,
                        proposed_end: null,
                        status: "scheduled",
                        updated_by: user?.id,
                      }).eq("id", job.id);
                      toast.success("Nytt tidspunkt godkjent");
                      fetchJob();
                      fetchLogs();
                    }}
                  >
                    Godkjenn
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    onClick={async () => {
                      await supabase.from("events").update({
                        proposed_start: null,
                        proposed_end: null,
                        status: "scheduled",
                        updated_by: user?.id,
                      }).eq("id", job.id);
                      toast.success("Foreslått endring avvist");
                      fetchJob();
                      fetchLogs();
                    }}
                  >
                    Avvis
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ Main Content: 2-col grid ═══ */}
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* ── LEFT COLUMN (3/5) ── */}
            <div className="lg:col-span-3 space-y-6">

              {/* Planlegging */}
              <SectionCard>
                <SectionTitle icon={<Clock className="h-4 w-4 text-primary" />}>Planlegging</SectionTitle>
                <div className="space-y-3">
                  {/* Time / Location / Technicians */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Tidspunkt</p>
                      <p className="text-sm font-medium">
                        {format(job.start, "EEEE d. MMM", { locale: nb })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(job.start, "HH:mm")} – {format(job.end, "HH:mm")}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Adresse</p>
                      <p className="text-sm font-medium">{job.address || "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Montører</p>
                      <p className="text-sm font-medium">
                        {technicianNames.length > 0 ? technicianNames.join(", ") : `${job.technicianIds.length} tildelt`}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  {job.description && (
                    <div className="pt-2 border-t border-border/50">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.description}</p>
                    </div>
                  )}

                  {/* Attendee statuses */}
                  {job.attendeeStatuses.length > 0 && (
                    <div className="pt-2 border-t border-border/50">
                      <AttendeeStatusList attendeeStatuses={job.attendeeStatuses} />
                    </div>
                  )}

                  {/* Calendar sync */}
                  <div className="pt-2 border-t border-border/50">
                    <JobCalendarSync
                      jobId={job.id}
                      jobStart={job.start}
                      jobEnd={job.end}
                      technicianIds={job.technicianIds}
                      isAdmin={isAdmin}
                      calendarDirty={job.calendarDirty}
                      calendarLastSyncedAt={job.calendarLastSyncedAt}
                      onSynced={() => fetchJob()}
                    />
                  </div>
                </div>
              </SectionCard>

              {/* Teams-møte */}
              <SectionCard>
                <SectionTitle icon={<Video className="h-4 w-4 text-primary" />}>Teams-møte</SectionTitle>
                {job.meetingJoinUrl ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4 text-sm flex-wrap">
                      <div>
                        <span className="text-muted-foreground">Tidspunkt: </span>
                        {format(job.start, "d. MMM HH:mm", { locale: nb })} – {format(job.end, "HH:mm")}
                      </div>
                      {job.meetingCreatedAt && (
                        <div>
                          <span className="text-muted-foreground">Opprettet: </span>
                          {format(job.meetingCreatedAt, "d. MMM HH:mm", { locale: nb })}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="rounded-xl gap-1.5"
                        onClick={() => window.open(job.meetingJoinUrl!, "_blank")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Bli med
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl gap-1.5"
                        onClick={() => {
                          navigator.clipboard.writeText(job.meetingJoinUrl!);
                          toast.success("Møtelenke kopiert");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Kopier lenke
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Ingen Teams-møte opprettet.</p>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl gap-1.5"
                        disabled={meetingLoading}
                        onClick={handleCreateMeeting}
                      >
                        {meetingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
                        Opprett Teams-møte
                      </Button>
                    )}
                  </div>
                )}
              </SectionCard>

              {/* Dokumenter & Bilder */}
              <SectionCard>
                <SectionTitle icon={<FileText className="h-4 w-4 text-primary" />}>Dokumentasjon</SectionTitle>

                {/* Linked Offer */}
                {offerData && (
                  <div className="mb-4 p-3 rounded-xl bg-accent/40 border border-border/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Tilbud {offerData.offer_number} (v{offerData.version})</p>
                      <Badge className={OFFER_STATUS_CONFIG[offerData.status as OfferStatus]?.className}>
                        {OFFER_STATUS_CONFIG[offerData.status as OfferStatus]?.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sum inkl. MVA: <span className="font-mono">kr {Number(offerData.total_inc_vat).toLocaleString("nb-NO")}</span>
                    </p>
                    <div className="flex gap-2">
                      {offerData.generated_pdf_url && (
                        <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs" onClick={() => window.open(offerData.generated_pdf_url, "_blank")}>
                          <FileText className="h-3 w-3" /> Åpne tilbud
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs" onClick={() => navigate(`/calculations/${offerData.calculation_id}`)}>
                        Gå til kalkulasjon
                      </Button>
                    </div>
                  </div>
                )}

                {/* Document list */}
                {docAttachments.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Filer</p>
                    {docAttachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl border border-border/50 p-3 hover:bg-accent/30 transition-colors">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium flex-1 truncate hover:underline">
                          {att.name}
                        </a>
                        {att.size && <span className="text-xs text-muted-foreground shrink-0">{(att.size / 1024).toFixed(0)} KB</span>}
                        <a href={att.url} download className="shrink-0"><Download className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" /></a>
                        {isAdmin && (
                          <button onClick={() => handleDeleteAttachment(att.name)} className="shrink-0">
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Image gallery */}
                {imageAttachments.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Bilder</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {imageAttachments.map((att, i) => (
                        <div key={i} className="group relative">
                          <button
                            onClick={() => { setLightboxIndex(i); setLightboxOpen(true); }}
                            className="block w-full aspect-square rounded-xl overflow-hidden border border-border/50 bg-muted cursor-pointer"
                          >
                            <img
                              src={att.url}
                              alt={att.name}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              loading="lazy"
                            />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteAttachment(att.name)}
                              className="absolute top-1 right-1 bg-card/80 backdrop-blur rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : docAttachments.length === 0 && !offerData ? (
                  <p className="text-sm text-muted-foreground">Ingen dokumenter eller bilder lastet opp.</p>
                ) : null}
              </SectionCard>
            </div>

            {/* ── RIGHT COLUMN (2/5) ── */}
            <div className="lg:col-span-2 space-y-6">

              {/* E-post */}
              <SectionCard>
                <EmailComposer
                  entityType="job"
                  entityId={job.id}
                  defaultSubject={`${job.customer || ""} | ${job.title}`}
                  refCode={job.internalNumber || displayNumber}
                  onSent={() => fetchLogs()}
                />
              </SectionCard>

              {/* Historikk */}
              <SectionCard>
                <SectionTitle icon={<Clock className="h-4 w-4 text-muted-foreground" />}>Historikk</SectionTitle>
                {logs.length > 0 ? (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {logs.map((log) => (
                      <div key={log.id} className="flex items-start gap-3 text-sm">
                        <div className="h-2 w-2 rounded-full bg-border mt-1.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{log.change_summary || log.action_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(log.timestamp), "d. MMM yyyy HH:mm", { locale: nb })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Ingen historikk registrert.</p>
                )}
              </SectionCard>

              {/* Audit info */}
              <SectionCard>
                <AuditInfo job={job} />
              </SectionCard>

              {/* Admin Debug (collapsed) */}
              {isAdmin && job.microsoftEventId && (
                <Collapsible open={debugOpen} onOpenChange={setDebugOpen}>
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-2">
                      <ChevronDown className={`h-3 w-3 transition-transform ${debugOpen ? "rotate-180" : ""}`} />
                      Admin: Legacy Outlook Sync
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SectionCard className="mt-2">
                      <div className="flex items-center justify-between mb-3">
                        <SectionTitle icon={<CalendarCheck className="h-4 w-4 text-muted-foreground" />}>Legacy Outlook</SectionTitle>
                        <SyncBadge status={job.outlookSyncStatus} />
                      </div>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Event ID: </span>
                          <span className="font-mono text-xs">{job.microsoftEventId.slice(0, 20)}…</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sist synkronisert: </span>
                          {job.outlookLastSyncedAt ? format(job.outlookLastSyncedAt, "d. MMM yyyy HH:mm", { locale: nb }) : "Aldri"}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs" disabled={!!syncLoading} onClick={() => handleOutlookAction("resync")}>
                          {syncLoading === "resync" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          Resync
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs" disabled={!!syncLoading} onClick={() => handleOutlookAction("disconnect")}>
                          {syncLoading === "disconnect" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />}
                          Koble fra
                        </Button>
                      </div>
                    </SectionCard>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </div>
        </div>

        {/* ── Mobile status selector ── */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border/50 bg-card/90 backdrop-blur-xl p-3 safe-area-bottom">
          <Select
            value={job.status}
            onValueChange={(v) => handleStatusChange(v as JobStatus)}
            disabled={statusUpdating}
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_STATUSES.filter((s) => canSetStatus(role, s)).map((s) => (
                <SelectItem key={s} value={s}>{JOB_STATUS_CONFIG[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Dialogs */}
      {id && (
        <EditJobDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          jobId={id}
          onSaved={() => { fetchJob(); fetchLogs(); }}
        />
      )}
      <ImageLightbox
        images={imageAttachments}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        canDelete={isAdmin}
        onDelete={handleDeleteAttachment}
      />
    </>
  );
}
