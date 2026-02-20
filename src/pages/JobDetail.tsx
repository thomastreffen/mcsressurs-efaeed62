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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Hash,
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
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import type { OutlookSyncStatus } from "@/lib/mock-data";

const SYNC_STATUS_MAP: Record<string, { label: string; className: string }> = {
  not_synced: { label: "Ikke synkronisert", className: "bg-muted text-muted-foreground" },
  synced: { label: "Synkronisert", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  missing_in_outlook: { label: "Mangler i Outlook", className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  failed: { label: "Feilet", className: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Kansellert", className: "bg-muted text-muted-foreground" },
  restored: { label: "Gjenopprettet", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
};

function SyncStatusBadge({ status }: { status?: OutlookSyncStatus }) {
  const config = SYNC_STATUS_MAP[status || "not_synced"] || SYNC_STATUS_MAP.not_synced;
  return <Badge className={config.className}>{config.label}</Badge>;
}

interface EventLog {
  id: string;
  action_type: string;
  change_summary: string | null;
  performed_by: string | null;
  timestamp: string;
}

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
  const [offerData, setOfferData] = useState<any>(null);

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
    // Fetch linked offer
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">Jobb ikke funnet</p>
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
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5 -ml-2">
              <ArrowLeft className="h-4 w-4" />
              Tilbake
            </Button>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Rediger
              </Button>
            )}
          </div>

          <header className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold">{job.title}</h1>
                  <JobStatusBadge status={job.status} />
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5" />
                    {displayNumber}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    {job.customer}
                  </span>
                </div>
              </div>

              <div className="shrink-0 w-full sm:w-52">
                <Select
                  value={job.status}
                  onValueChange={(v) => handleStatusChange(v as JobStatus)}
                  disabled={statusUpdating}
                >
                  <SelectTrigger>
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

            {/* Proposed time change banner */}
            {job.status === "time_change_proposed" && job.proposedStart && job.proposedEnd && (
              <div className="rounded-lg border border-status-time-change-proposed/30 bg-status-time-change-proposed/10 p-4 space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-2 text-status-time-change-proposed">
                  ⚠️ Foreslått nytt tidspunkt
                </h3>
                <p className="text-sm">
                  {format(job.proposedStart, "EEEE d. MMMM yyyy", { locale: nb })},{" "}
                  {format(job.proposedStart, "HH:mm")} – {format(job.proposedEnd, "HH:mm")}
                </p>
                {isAdmin && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
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
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border bg-card p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  Adresse
                </div>
                <p className="text-sm font-medium">{job.address || "—"}</p>
              </div>
              <div className="rounded-lg border bg-card p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Tidspunkt
                </div>
                <p className="text-sm font-medium">
                  {format(job.start, "EEEE d. MMMM yyyy", { locale: nb })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(job.start, "HH:mm")} – {format(job.end, "HH:mm")}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  Montører
                </div>
                <p className="text-sm font-medium">
                  {technicianNames.length > 0 ? technicianNames.join(", ") : `${job.technicianIds.length} tildelt`}
                </p>
              </div>
            </div>
          </header>

          <Tabs defaultValue="overview">
            <TabsList className="w-full sm:w-auto flex overflow-x-auto">
              <TabsTrigger value="overview">Oversikt</TabsTrigger>
              <TabsTrigger value="email" className="gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                E-post
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Dokumenter {docAttachments.length > 0 && `(${docAttachments.length})`}
              </TabsTrigger>
              <TabsTrigger value="images" className="gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" />
                Bilder {imageAttachments.length > 0 && `(${imageAttachments.length})`}
              </TabsTrigger>
              <TabsTrigger value="history">Historikk</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 pt-4">
              {job.description && (
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="text-sm font-medium mb-2">Beskrivelse</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.description}</p>
                </div>
              )}
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <h3 className="text-sm font-medium">Montørstatus</h3>
                <AttendeeStatusList attendeeStatuses={job.attendeeStatuses} />
              </div>
              <div className="rounded-lg border bg-card p-4">
                <AuditInfo job={job} />
              </div>

              {/* Linked Offer */}
              {offerData && (
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Tilbud
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Tilbudsnr:</span>{" "}
                      <span className="font-mono font-medium">{offerData.offer_number}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Versjon:</span> v{offerData.version}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>{" "}
                      <Badge className={OFFER_STATUS_CONFIG[offerData.status as OfferStatus]?.className}>
                        {OFFER_STATUS_CONFIG[offerData.status as OfferStatus]?.label}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Sum inkl. MVA:</span>{" "}
                      <span className="font-mono">kr {Number(offerData.total_inc_vat).toLocaleString("nb-NO")}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {offerData.generated_pdf_url && (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(offerData.generated_pdf_url, "_blank")}>
                        <FileText className="h-3.5 w-3.5" /> Åpne tilbud
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/calculations/${offerData.calculation_id}`)}>
                      Gå til kalkulasjon
                    </Button>
                  </div>
                </div>
              )}

              {/* Per-technician Outlook Calendar Sync */}
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

              {/* Legacy Outlook Sync Section – Admin only */}
              {isAdmin && job.microsoftEventId && (
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <CalendarCheck className="h-4 w-4" />
                      Legacy Outlook Sync
                    </h3>
                    <SyncStatusBadge status={job.outlookSyncStatus} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Outlook Event ID:</span>{" "}
                      <span className="font-mono text-xs">{job.microsoftEventId.slice(0, 20) + "…"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Sist synkronisert:</span>{" "}
                      <span>{job.outlookLastSyncedAt ? format(job.outlookLastSyncedAt, "d. MMM yyyy HH:mm", { locale: nb }) : "Aldri"}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" disabled={!!syncLoading} onClick={() => handleOutlookAction("resync")} className="gap-1.5">
                      {syncLoading === "resync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Resync
                    </Button>
                    <Button size="sm" variant="outline" disabled={!!syncLoading} onClick={() => handleOutlookAction("disconnect")} className="gap-1.5">
                      {syncLoading === "disconnect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                      Koble fra
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="email" className="pt-4">
              <EmailComposer
                entityType="job"
                entityId={job.id}
                defaultSubject={`${job.customer || ""} | ${job.title}`}
                refCode={job.internalNumber || displayNumber}
                onSent={() => fetchLogs()}
              />
            </TabsContent>

            <TabsContent value="documents" className="pt-4">
              <div className="rounded-lg border bg-card p-4">
                {docAttachments.length > 0 ? (
                  <div className="space-y-2">
                    {docAttachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-secondary transition-colors">
                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                        <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium flex-1 truncate hover:underline">
                          {att.name}
                        </a>
                        {att.size && (
                          <span className="text-xs text-muted-foreground shrink-0">{(att.size / 1024).toFixed(0)} KB</span>
                        )}
                        <a href={att.url} download className="shrink-0">
                          <Download className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </a>
                        {isAdmin && (
                          <button onClick={() => handleDeleteAttachment(att.name)} className="shrink-0">
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Ingen dokumenter lastet opp.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="images" className="pt-4">
              <div className="rounded-lg border bg-card p-4">
                {imageAttachments.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {imageAttachments.map((att, i) => (
                      <div key={i} className="group relative">
                        <button
                          onClick={() => { setLightboxIndex(i); setLightboxOpen(true); }}
                          className="block w-full aspect-square rounded-lg overflow-hidden border bg-muted cursor-pointer"
                        >
                          <img
                            src={att.url}
                            alt={att.name}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                          />
                        </button>
                        <div className="mt-1 flex items-center justify-between">
                          <p className="text-xs text-muted-foreground truncate flex-1">{att.name}</p>
                          {isAdmin && (
                            <button onClick={() => handleDeleteAttachment(att.name)} className="shrink-0 ml-1">
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Ingen bilder lastet opp.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="history" className="pt-4">
              <div className="rounded-lg border bg-card p-4">
                {logs.length > 0 ? (
                  <div className="space-y-3">
                    {logs.map((log) => (
                      <div key={log.id} className="flex items-start gap-3 text-sm">
                        <div className="h-2 w-2 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                        <div>
                          <p className="font-medium">{log.change_summary || log.action_type}</p>
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
              </div>
            </TabsContent>
          </Tabs>
      </div>

      {/* Edit dialog */}
      {id && (
        <EditJobDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          jobId={id}
          onSaved={() => { fetchJob(); fetchLogs(); }}
        />
      )}

      {/* Image lightbox */}
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
