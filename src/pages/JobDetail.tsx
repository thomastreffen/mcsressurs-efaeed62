import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { OFFER_STATUS_CONFIG, type OfferStatus } from "@/lib/offer-status";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { AttendeeStatusList } from "@/components/AttendeeStatusList";

import { DocumentCenter } from "@/components/DocumentCenter";
import { JobRiskPanel } from "@/components/risk/JobRiskPanel";
import { AuditInfo } from "@/components/AuditInfo";
import { ProjectPulse } from "@/components/ProjectPulse";
import { ProjectPulseActions } from "@/components/ProjectPulseActions";
import { EditJobDialog } from "@/components/EditJobDialog";
import { ImageLightbox } from "@/components/ImageLightbox";
import { JobSummaryCard } from "@/components/JobSummaryCard";
import { ChangeOrderTab } from "@/components/change-orders/ChangeOrderTab";
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
  Loader2,
  FileText,
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
  Mail,
  Send,
  FileSignature,
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
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileActionBar } from "@/components/MobileActionBar";

/* ─── Sync Status Badge (small pill) ─── */
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
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${syncBadgeClasses[config.variant]}`}>
      {config.label}
    </span>
  );
}

/* ─── Card wrapper with optional accent stripe ─── */
function SectionCard({ children, className = "", accent }: { children: React.ReactNode; className?: string; accent?: "blue" | "orange" | "neutral" }) {
  const accentClass = accent === "blue"
    ? "border-l-[3px] border-l-primary"
    : accent === "orange"
    ? "border-l-[3px] border-l-status-ready-for-invoicing"
    : accent === "neutral"
    ? "border-l-[3px] border-l-border"
    : "";
  return (
    <div className={`rounded-2xl border border-border/60 bg-card shadow-sm p-5 ${accentClass} ${className}`}>
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
  const isMobile = useIsMobile();

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

  // Economy source hierarchy state
  const [econData, setEconData] = useState<{
    totalAmount: number | null;
    currency: string;
    paymentTerms: string | null;
    source: "job_summaries" | "offer_analysis" | "ingen";
  }>({ totalAmount: null, currency: "NOK", paymentTerms: null, source: "ingen" });
  const [historyOpen, setHistoryOpen] = useState(!isMobile);
  const [coApproved, setCoApproved] = useState(0);
  const [coPending, setCoPending] = useState(0);

  // Refs for scroll-to actions
  const emailRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef<HTMLDivElement>(null);

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

  const fetchEconData = useCallback(async () => {
    if (!id) return;
    // 1. Try job_summaries first
    const { data: summary } = await supabase
      .from("job_summaries")
      .select("key_numbers")
      .eq("job_id", id)
      .maybeSingle();

    const kn = (summary?.key_numbers as any) || {};
    if (kn.total_amount != null) {
      setEconData({
        totalAmount: Number(kn.total_amount),
        currency: kn.currency || "NOK",
        paymentTerms: kn.payment_terms || null,
        source: "job_summaries",
      });
      return;
    }

    // 2. Fallback: latest offer analysis
    const { data: analyses } = await supabase
      .from("document_analyses")
      .select("parsed_fields")
      .eq("job_id", id)
      .eq("analysis_type", "offer")
      .order("created_at", { ascending: false })
      .limit(1);

    if (analyses && analyses.length > 0) {
      const pf = (analyses[0].parsed_fields as any) || {};
      if (pf.total_amount != null) {
        // Also check contract analysis for payment_terms
        const { data: contractAnalyses } = await supabase
          .from("document_analyses")
          .select("parsed_fields")
          .eq("job_id", id)
          .eq("analysis_type", "contract")
          .order("created_at", { ascending: false })
          .limit(1);
        const cpf = contractAnalyses?.[0]?.parsed_fields as any;

        setEconData({
          totalAmount: Number(pf.total_amount),
          currency: pf.currency || "NOK",
          paymentTerms: cpf?.payment_terms || null,
          source: "offer_analysis",
        });
        return;
      }
    }

    // 3. No data
    setEconData({ totalAmount: null, currency: "NOK", paymentTerms: null, source: "ingen" });
  }, [id]);

  useEffect(() => {
    fetchJob();
    fetchLogs();
    fetchEconData();
    if (id) {
      supabase.from("events").select("offer_id").eq("id", id).single().then(({ data }) => {
        if (data?.offer_id) {
          supabase.from("offers").select("*, calculations(customer_name, project_title)").eq("id", data.offer_id).single().then(({ data: offer }) => {
            if (offer) setOfferData(offer);
          });
        }
      });
    }
  }, [fetchJob, fetchLogs, fetchEconData, id]);

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

  /* ── Scroll-to helpers ── */
  const scrollToEmail = () => emailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  const scrollToSync = () => syncRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

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
      <div className="min-h-screen bg-card">
        {/* ═══ Sticky Header ═══ */}
        <div className="sticky top-0 z-30 border-b border-primary/10 bg-gradient-to-r from-primary/[0.03] to-transparent backdrop-blur-xl">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-start justify-between gap-3">
              {/* Left: back + job info */}
              <div className="flex items-start gap-2.5 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/")}
                  className="shrink-0 mt-0.5 rounded-xl h-8 w-8 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-base sm:text-lg font-bold tracking-tight truncate">
                      {displayNumber}
                    </h1>
                    <JobStatusBadge status={job.status} />
                    {job.calendarDirty && (
                      <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-medium leading-none text-orange-700 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800">
                        Usynkronisert
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 mt-0.5 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {job.customer}
                    </span>
                    {job.address && (
                      <span className="flex items-center gap-1 hidden sm:flex">
                        <MapPin className="h-3 w-3" />
                        {job.address}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(job.start, "d. MMM", { locale: nb })} {format(job.start, "HH:mm")}–{format(job.end, "HH:mm")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Primary actions + More */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* 3 primary action buttons (hidden on smallest screens, shown sm+) */}
                <div className="hidden sm:flex items-center gap-1.5">
                  {/* Email */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl gap-1.5 h-8 text-xs font-medium focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={scrollToEmail}
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Opprett kladd
                  </Button>

                  {/* Synk Outlook */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl gap-1.5 h-8 text-xs font-medium focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={scrollToSync}
                  >
                    <CalendarCheck className="h-3.5 w-3.5" />
                    Synk
                  </Button>

                  {/* Teams */}
                  {job.meetingJoinUrl ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl gap-1.5 h-8 text-xs font-medium focus-visible:ring-2 focus-visible:ring-primary"
                      onClick={() => window.open(job.meetingJoinUrl!, "_blank")}
                    >
                      <Video className="h-3.5 w-3.5" />
                      Bli med
                    </Button>
                  ) : isAdmin ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl gap-1.5 h-8 text-xs font-medium focus-visible:ring-2 focus-visible:ring-primary"
                      disabled={meetingLoading}
                      onClick={handleCreateMeeting}
                    >
                      {meetingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
                      Teams
                    </Button>
                  ) : null}
                </div>

                {/* Status select (desktop) */}
                <div className="hidden md:block w-40 ml-1">
                  <Select
                    value={job.status}
                    onValueChange={(v) => handleStatusChange(v as JobStatus)}
                    disabled={statusUpdating}
                  >
                    <SelectTrigger className="h-8 rounded-xl text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_STATUSES.filter((s) => canSetStatus(role, s)).map((s) => (
                        <SelectItem key={s} value={s}>{JOB_STATUS_CONFIG[s].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* More menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-xl h-8 w-8 focus-visible:ring-2 focus-visible:ring-primary">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {/* Mobile-only shortcuts */}
                    <div className="sm:hidden">
                      <DropdownMenuItem onClick={scrollToEmail} className="gap-2">
                        <Mail className="h-3.5 w-3.5" /> Opprett kladd
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={scrollToSync} className="gap-2">
                        <CalendarCheck className="h-3.5 w-3.5" /> Synk Outlook
                      </DropdownMenuItem>
                      {job.meetingJoinUrl ? (
                        <DropdownMenuItem onClick={() => window.open(job.meetingJoinUrl!, "_blank")} className="gap-2">
                          <Video className="h-3.5 w-3.5" /> Bli med i Teams
                        </DropdownMenuItem>
                      ) : isAdmin ? (
                        <DropdownMenuItem onClick={handleCreateMeeting} disabled={meetingLoading} className="gap-2">
                          <Video className="h-3.5 w-3.5" /> Opprett Teams-møte
                        </DropdownMenuItem>
                      ) : null}
                    </div>
                    {isAdmin && (
                      <DropdownMenuItem onClick={() => setEditOpen(true)} className="gap-2">
                        <Pencil className="h-3.5 w-3.5" /> Rediger jobb
                      </DropdownMenuItem>
                    )}
                    {isAdmin && job.microsoftEventId && (
                      <>
                        <DropdownMenuItem onClick={() => handleOutlookAction("resync")} disabled={!!syncLoading} className="gap-2">
                          <RefreshCw className="h-3.5 w-3.5" /> Resync Outlook
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOutlookAction("disconnect")} disabled={!!syncLoading} className="gap-2">
                          <Unplug className="h-3.5 w-3.5" /> Koble fra Outlook
                        </DropdownMenuItem>
                      </>
                    )}
                    {job.meetingJoinUrl && (
                      <DropdownMenuItem
                        onClick={() => {
                          navigator.clipboard.writeText(job.meetingJoinUrl!);
                          toast.success("Møtelenke kopiert");
                        }}
                        className="gap-2"
                      >
                        <Copy className="h-3.5 w-3.5" /> Kopier Teams-lenke
                      </DropdownMenuItem>
                    )}
                    {isAdmin && (
                      <DropdownMenuItem
                        className="gap-2 text-destructive focus:text-destructive"
                        onClick={async () => {
                          await supabase.from("events").update({ deleted_at: new Date().toISOString(), deleted_by: user?.id } as any).eq("id", job.id);
                          toast.success("Flyttet til papirkurv", { description: job.title });
                          navigate("/jobs");
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Flytt til papirkurv
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 pb-28 md:pb-8">
          {/* ═══ PROSJEKT-PULS ═══ */}
          <ProjectPulse jobId={id!} />

          {/* Job Summary Card */}
          <div className="mt-4">
            <JobSummaryCard
              jobId={id!}
              customer={job.customer}
              status={job.status}
              address={job.address}
              technicianNames={technicianNames}
            />
          </div>

          {/* Tabbed Navigation */}
          <Tabs defaultValue="oversikt" className="mt-6">
            <TabsList className="h-9 w-full justify-start overflow-x-auto bg-muted/50 rounded-xl">
              <TabsTrigger value="oversikt" className="text-xs px-3 py-1.5 rounded-lg">Oversikt</TabsTrigger>
              <TabsTrigger value="okonomi" className="text-xs px-3 py-1.5 rounded-lg">Økonomi</TabsTrigger>
              <TabsTrigger value="dokumenter" className="text-xs px-3 py-1.5 rounded-lg">Dokumenter</TabsTrigger>
              <TabsTrigger value="plan" className="text-xs px-3 py-1.5 rounded-lg">Plan</TabsTrigger>
              <TabsTrigger value="epost" className="text-xs px-3 py-1.5 rounded-lg">E-post</TabsTrigger>
              <TabsTrigger value="risiko" className="text-xs px-3 py-1.5 rounded-lg">Risiko</TabsTrigger>
              <TabsTrigger value="tillegg" className="text-xs px-3 py-1.5 rounded-lg">Tillegg</TabsTrigger>
            </TabsList>

            {/* ── OVERSIKT ── */}
            <TabsContent value="oversikt" className="mt-5 space-y-6">
              {/* Action section */}
              <ProjectPulseActions jobId={id!} />

              {job.description && (
                <SectionCard>
                  <SectionTitle icon={<FileText className="h-4 w-4 text-muted-foreground" />}>Beskrivelse</SectionTitle>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.description}</p>
                </SectionCard>
              )}

              {/* Teams-møte */}
              <SectionCard accent="blue">
                <SectionTitle icon={<Video className="h-4 w-4 text-primary" />}>Teams-møte</SectionTitle>
                {job.meetingJoinUrl ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4 text-sm flex-wrap">
                      <div>
                        <span className="text-muted-foreground text-xs">Tidspunkt: </span>
                        <span className="text-sm">{format(job.start, "d. MMM HH:mm", { locale: nb })} – {format(job.end, "HH:mm")}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="rounded-xl gap-1.5" onClick={() => window.open(job.meetingJoinUrl!, "_blank")}>
                        <ExternalLink className="h-3.5 w-3.5" /> Bli med
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={() => { navigator.clipboard.writeText(job.meetingJoinUrl!); toast.success("Møtelenke kopiert"); }}>
                        <Copy className="h-3.5 w-3.5" /> Kopier lenke
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Ingen Teams-møte opprettet.</p>
                    {isAdmin && (
                      <Button size="sm" variant="outline" className="rounded-xl gap-1.5" disabled={meetingLoading} onClick={handleCreateMeeting}>
                        {meetingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
                        Opprett Teams-møte
                      </Button>
                    )}
                  </div>
                )}
              </SectionCard>

              {/* Historikk */}
              <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                <SectionCard>
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center justify-between w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg -m-1 p-1">
                      <SectionTitle icon={<Clock className="h-4 w-4 text-muted-foreground" />}>
                        Historikk
                        {logs.length > 0 && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground leading-none">
                            {logs.length}
                          </span>
                        )}
                      </SectionTitle>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${historyOpen ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {logs.length > 0 ? (
                      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 mt-1">
                        {logs.map((log) => (
                          <div key={log.id} className="flex items-start gap-2.5 text-sm">
                            <div className="h-1.5 w-1.5 rounded-full bg-border mt-2 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm text-foreground">{log.change_summary || log.action_type}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {format(new Date(log.timestamp), "d. MMM yyyy HH:mm", { locale: nb })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">Ingen historikk registrert.</p>
                    )}
                  </CollapsibleContent>
                </SectionCard>
              </Collapsible>

              {/* Detaljer */}
              <Collapsible defaultOpen={!isMobile}>
                <SectionCard>
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center justify-between w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg -m-1 p-1">
                      <SectionTitle icon={<FileText className="h-4 w-4 text-muted-foreground" />}>Detaljer</SectionTitle>
                      <ChevronDown className="h-4 w-4 text-muted-foreground lg:hidden" />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <AuditInfo job={job} />
                  </CollapsibleContent>
                </SectionCard>
              </Collapsible>
            </TabsContent>

            {/* ── ØKONOMI ── */}
            <TabsContent value="okonomi" className="mt-5 space-y-6">
              {/* KPI Cards */}
              {econData.totalAmount != null ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-1">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Baseverdi</p>
                      <p className="text-lg font-bold text-foreground font-mono">
                        {econData.currency} {econData.totalAmount.toLocaleString("nb-NO")}
                      </p>
                    </div>
                    {coApproved > 0 && (
                      <div className="rounded-xl border border-success/20 bg-success/5 p-4 space-y-1">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Godkjente tillegg</p>
                        <p className="text-sm font-bold font-mono text-success">+{econData.currency} {coApproved.toLocaleString("nb-NO")}</p>
                      </div>
                    )}
                    {coPending > 0 && (
                      <div className="rounded-xl border border-info/20 bg-info/5 p-4 space-y-1">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Avventende</p>
                        <p className="text-sm font-bold font-mono text-info">{econData.currency} {coPending.toLocaleString("nb-NO")}</p>
                      </div>
                    )}
                    <div className="rounded-xl border border-border/40 bg-card p-4 space-y-1">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Total nå</p>
                      <p className="text-lg font-bold text-foreground font-mono">
                        {econData.currency} {(econData.totalAmount + coApproved).toLocaleString("nb-NO")}
                      </p>
                    </div>
                  </div>

                  {/* Payment terms & offer details */}
                  <SectionCard>
                    <SectionTitle icon={<FileText className="h-4 w-4 text-primary" />}>Økonomidetaljer</SectionTitle>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tilbudsverdi</span>
                        <span className="font-mono font-medium">{econData.currency} {econData.totalAmount.toLocaleString("nb-NO")}</span>
                      </div>
                      {offerData && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Tilbudssum eks. mva</span>
                            <span className="font-mono font-medium">NOK {Number(offerData.total_ex_vat).toLocaleString("nb-NO")}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Tilbudssum inkl. mva</span>
                            <span className="font-mono font-medium">NOK {Number(offerData.total_inc_vat).toLocaleString("nb-NO")}</span>
                          </div>
                        </>
                      )}
                      {econData.paymentTerms && (
                        <div className="flex justify-between text-sm pt-3 border-t border-border/40">
                          <span className="text-muted-foreground">Betalingsvilkår</span>
                          <span className="font-medium">{econData.paymentTerms}</span>
                        </div>
                      )}
                      <div className="pt-3 border-t border-border/40">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Kostnader</span>
                          <span className="text-xs text-muted-foreground italic">Kost ikke registrert</span>
                        </div>
                      </div>
                      <div className="pt-3 border-t border-border/40">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Margin</span>
                          <span className="text-xs text-muted-foreground italic">Krever kostnadsregistrering</span>
                        </div>
                      </div>
                    </div>
                  </SectionCard>
                </>
              ) : (
                <SectionCard>
                  <SectionTitle icon={<FileText className="h-4 w-4 text-primary" />}>Økonomi</SectionTitle>
                  <p className="text-sm text-muted-foreground">
                    Ingen tilbudsanalyse funnet ennå. Kjør tilbudsanalyse eller last opp tilbud.
                  </p>
                </SectionCard>
              )}

              {/* Admin debug source */}
              {isAdmin && (
                <p className="text-[10px] text-muted-foreground/60 pl-1">
                  Kilde: {econData.source}
                </p>
              )}
            </TabsContent>

            {/* ── DOKUMENTER ── */}
            <TabsContent value="dokumenter" className="mt-5">
              <SectionCard>
                <DocumentCenter jobId={id!} companyId={null} />
              </SectionCard>
            </TabsContent>

            {/* ── PLAN ── */}
            <TabsContent value="plan" className="mt-5 space-y-6">
              <SectionCard accent="blue">
                <SectionTitle icon={<Clock className="h-4 w-4 text-primary" />}>Planlegging</SectionTitle>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Tidspunkt</p>
                      <p className="text-sm font-medium">{format(job.start, "EEEE d. MMM", { locale: nb })}</p>
                      <p className="text-xs text-muted-foreground">{format(job.start, "HH:mm")} – {format(job.end, "HH:mm")}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Adresse</p>
                      <p className="text-sm font-medium">{job.address || "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Montører</p>
                      <p className="text-sm font-medium">
                        {technicianNames.length > 0 ? technicianNames.join(", ") : `${job.technicianIds.length} tildelt`}
                      </p>
                    </div>
                  </div>

                  {job.attendeeStatuses.length > 0 && (
                    <div className="pt-3 border-t border-border/40">
                      <AttendeeStatusList attendeeStatuses={job.attendeeStatuses} />
                    </div>
                  )}

                  <div ref={syncRef} className="pt-3 border-t border-border/40">
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
            </TabsContent>

            {/* ── E-POST ── */}
            <TabsContent value="epost" className="mt-5">
              <div ref={emailRef}>
                <SectionCard accent="orange">
                  <EmailComposer
                    entityType="job"
                    entityId={job.id}
                    defaultSubject={`${job.customer || ""} | ${job.title}`}
                    refCode={job.internalNumber || displayNumber}
                    onSent={() => fetchLogs()}
                  />
                </SectionCard>
              </div>
            </TabsContent>

            {/* ── RISIKO ── */}
            <TabsContent value="risiko" className="mt-5">
              <SectionCard>
                <SectionTitle icon={<FileSignature className="h-4 w-4 text-primary" />}>Risikooversikt</SectionTitle>
                <JobRiskPanel jobId={id!} companyId={undefined} />
              </SectionCard>
            </TabsContent>

            {/* ── TILLEGG ── */}
            <TabsContent value="tillegg" className="mt-5">
              <SectionCard>
                <ChangeOrderTab
                  jobId={id!}
                  customer={job.customer}
                  customerEmail={undefined}
                  baseAmount={econData.totalAmount}
                  currency={econData.currency}
                  onTotalsChange={(approved, pending) => { setCoApproved(approved); setCoPending(pending); }}
                />
              </SectionCard>
            </TabsContent>
          </Tabs>

          {/* Admin Debug (collapsed) */}
          {isAdmin && job.microsoftEventId && (
            <Collapsible open={debugOpen} onOpenChange={setDebugOpen} className="mt-6">
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
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
                  <div className="space-y-1.5 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Event ID: </span>
                      <span className="font-mono text-[11px]">{job.microsoftEventId.slice(0, 20)}…</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Sist synkronisert: </span>
                      <span className="text-sm">{job.outlookLastSyncedAt ? format(job.outlookLastSyncedAt, "d. MMM yyyy HH:mm", { locale: nb }) : "Aldri"}</span>
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

        {/* ── Mobile Action Bar ── */}
        <MobileActionBar
          job={{ id: job.id, status: job.status, title: job.title }}
          onStatusChanged={(newStatus) => {
            setJob((prev) => prev ? { ...prev, status: newStatus } : null);
            fetchLogs();
          }}
          onScrollToEmail={scrollToEmail}
        />
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
