import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

import { ProjectHeader } from "@/components/project/ProjectHeader";
import { ProjectSubnav } from "@/components/project/ProjectSubnav";
import { ProjectDashboard } from "@/components/project/ProjectDashboard";

import { DocumentCenter } from "@/components/DocumentCenter";
import { JobRiskPanel } from "@/components/risk/JobRiskPanel";
import { AuditInfo } from "@/components/AuditInfo";
import { EditJobDialog } from "@/components/EditJobDialog";
import { ImageLightbox } from "@/components/ImageLightbox";
import { ChangeOrderTab } from "@/components/change-orders/ChangeOrderTab";
import { Button } from "@/components/ui/button";
import type { Job, Attachment } from "@/lib/mock-data";
import {
  JOB_STATUS_CONFIG,
  ALL_STATUSES,
  canSetStatus,
  getDisplayNumber,
  type JobStatus,
} from "@/lib/job-status";
import { useAuth } from "@/hooks/useAuth";
import { ProjectPlanTab } from "@/components/ProjectPlanTab";
import { SubProjectSection } from "@/components/SubProjectSection";
import { ServiceJobsTab } from "@/components/project/ServiceJobsTab";
import { EmailComposer } from "@/components/EmailComposer";
import { ProjectFormsTab } from "@/components/forms/ProjectFormsTab";
import {
  Loader2,
  FileText,
  FileSignature,
} from "lucide-react";
import { toast } from "sonner";
import type { OutlookSyncStatus } from "@/lib/mock-data";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileActionBar } from "@/components/MobileActionBar";

/* ─── Card wrapper ─── */
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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "dash";
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
  const [offerData, setOfferData] = useState<any>(null);
  const [parentProjectId, setParentProjectId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  // Economy
  const [econData, setEconData] = useState<{
    totalAmount: number | null;
    currency: string;
    paymentTerms: string | null;
    source: "job_summaries" | "offer_analysis" | "ingen";
  }>({ totalAmount: null, currency: "NOK", paymentTerms: null, source: "ingen" });
  const [coApproved, setCoApproved] = useState(0);
  const [coPending, setCoPending] = useState(0);

  const emailRef = useRef<HTMLDivElement>(null);

  /* ── Tab navigation ── */
  const handleTabChange = (tab: string) => {
    setSearchParams({ tab });
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
    setParentProjectId(data.parent_project_id || null);
    setCustomerId(data.customer_id || null);
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

  const scrollToEmail = () => emailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

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
          <p className="text-lg font-semibold">Prosjekt ikke funnet</p>
          <Button variant="outline" onClick={() => navigate("/projects")}>Tilbake til prosjekter</Button>
        </div>
      </div>
    );
  }

  const displayNumber = getDisplayNumber(job.jobNumber ?? null, job.internalNumber ?? null);
  const imageAttachments = (job.attachments ?? []).filter((a) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(a.name));

  return (
    <>
      <div className="min-h-screen bg-background">
        {/* ═══ Project Header ═══ */}
        <ProjectHeader
          jobNumber={job.jobNumber ?? null}
          internalNumber={job.internalNumber ?? null}
          title={job.title}
          customer={job.customer}
          address={job.address}
          start={job.start}
          end={job.end}
          status={job.status}
          technicianNames={technicianNames}
          onNavigateTab={handleTabChange}
        />

        {/* ═══ Subnav ═══ */}
        <ProjectSubnav activeTab={activeTab} onTabChange={handleTabChange} />

        {/* ═══ Proposed time-change banner ═══ */}
        {job.status === "time_change_proposed" && job.proposedStart && job.proposedEnd && (
          <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-5">
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 space-y-2">
              <p className="text-sm font-medium text-accent">
                ⚠️ Foreslått nytt tidspunkt
              </p>
              <p className="text-sm text-muted-foreground">
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

        {/* ═══ Main Content ═══ */}
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 pb-28 md:pb-8">

          {/* ── DASHBOARD ── */}
          {activeTab === "dash" && (
            <ProjectDashboard
              jobId={id!}
              technicianNames={technicianNames}
              start={job.start}
              end={job.end}
              logs={logs}
              onNavigateTab={handleTabChange}
            />
          )}

          {/* ── PLAN ── */}
          {activeTab === "plan" && (
            <ProjectPlanTab
              jobId={job.id}
              jobTitle={job.title}
              jobStart={job.start}
              jobEnd={job.end}
              jobAddress={job.address}
              technicianIds={job.technicianIds}
              technicianNames={technicianNames}
              isAdmin={isAdmin}
              calendarDirty={job.calendarDirty}
              calendarLastSyncedAt={job.calendarLastSyncedAt}
              onSynced={() => fetchJob()}
              onResourceAssign={() => fetchJob()}
            />
          )}

          {/* ── SERVICEARBEID ── */}
          {activeTab === "servicearbeid" && (
            <ServiceJobsTab projectId={id!} />
          )}

          {/* ── SKJEMAER ── */}
          {activeTab === "skjemaer" && (
            <ProjectFormsTab projectId={id!} isAdmin={isAdmin} />
          )}

          {/* ── DOKUMENTER ── */}
          {activeTab === "dokumenter" && (
            <SectionCard>
              <DocumentCenter jobId={id!} companyId={null} />
            </SectionCard>
          )}

          {/* ── RISIKO ── */}
          {activeTab === "risiko" && (
            <SectionCard>
              <SectionTitle icon={<FileSignature className="h-4 w-4 text-primary" />}>Risikooversikt</SectionTitle>
              <JobRiskPanel jobId={id!} companyId={undefined} />
            </SectionCard>
          )}

          {/* ── ØKONOMI ── */}
          {activeTab === "okonomi" && (
            <div className="space-y-6">
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

              {isAdmin && (
                <p className="text-[10px] text-muted-foreground/60 pl-1">
                  Kilde: {econData.source}
                </p>
              )}

              {/* Change orders in economy tab */}
              <SectionCard>
                <SectionTitle icon={<FileSignature className="h-4 w-4 text-primary" />}>Tillegg og endringer</SectionTitle>
                <ChangeOrderTab
                  jobId={id!}
                  customer={job.customer}
                  customerEmail={undefined}
                  baseAmount={econData.totalAmount}
                  currency={econData.currency}
                  onTotalsChange={(approved, pending) => { setCoApproved(approved); setCoPending(pending); }}
                />
              </SectionCard>
            </div>
          )}

          {/* ── E-POST ── */}
          {activeTab === "epost" && (
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
