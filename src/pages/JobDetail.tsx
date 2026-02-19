import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { TopBar } from "@/components/TopBar";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { AttendeeStatusList } from "@/components/AttendeeStatusList";
import { AuditInfo } from "@/components/AuditInfo";
import { EventLogList } from "@/components/EventLogList";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getEventLogs, type Job, type Attachment } from "@/lib/mock-data";
import {
  JOB_STATUS_CONFIG,
  ALL_STATUSES,
  canSetStatus,
  getDisplayNumber,
  type JobStatus,
} from "@/lib/job-status";
import { useAuth } from "@/hooks/useAuth";
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
} from "lucide-react";
import { toast } from "sonner";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [technicianNames, setTechnicianNames] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;

    const fetchJob = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("events")
        .select(`
          *,
          event_technicians (
            technician_id,
            technicians (
              id,
              name,
              color
            )
          )
        `)
        .eq("id", id)
        .single();

      if (error || !data) {
        console.error("[JobDetail] Failed to fetch:", error);
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
      });
      setLoading(false);
    };

    fetchJob();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-screen flex-col">
        <TopBar onNewJob={() => {}} />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex h-screen flex-col">
        <TopBar onNewJob={() => {}} />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">Jobb ikke funnet</p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Tilbake til kalender
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const displayNumber = getDisplayNumber(job.jobNumber ?? null, job.internalNumber ?? null);
  const logs = getEventLogs(job.id);
  const role = user?.role ?? "montør";
  const attachments = job.attachments ?? [];
  const imageAttachments = attachments.filter((a) =>
    /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(a.name)
  );
  const docAttachments = attachments.filter(
    (a) => !/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(a.name)
  );

  const handleStatusChange = (newStatus: JobStatus) => {
    if (!canSetStatus(role, newStatus)) {
      toast.error("Du har ikke tilgang til å sette denne statusen");
      return;
    }
    toast.success("Status oppdatert", {
      description: `Jobb ${displayNumber} er nå "${JOB_STATUS_CONFIG[newStatus].label}"`,
    });
  };

  return (
    <div className="flex h-screen flex-col">
      <TopBar onNewJob={() => {}} />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-6 space-y-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            Tilbake
          </Button>

          <header className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold">{job.title}</h1>
                  <JobStatusBadge status={job.status} />
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
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

              <div className="shrink-0 w-52">
                <Select
                  value={job.status}
                  onValueChange={(v) => handleStatusChange(v as JobStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES.filter((s) => canSetStatus(role, s)).map((s) => (
                      <SelectItem key={s} value={s}>
                        {JOB_STATUS_CONFIG[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border bg-card p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  Adresse
                </div>
                <p className="text-sm font-medium">{job.address}</p>
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
            <TabsList>
              <TabsTrigger value="overview">Oversikt</TabsTrigger>
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
                  <p className="text-sm text-muted-foreground">{job.description}</p>
                </div>
              )}

              <div className="rounded-lg border bg-card p-4 space-y-3">
                <h3 className="text-sm font-medium">Montørstatus</h3>
                <AttendeeStatusList attendeeStatuses={job.attendeeStatuses} />
              </div>

              <div className="rounded-lg border bg-card p-4">
                <AuditInfo job={job} />
              </div>
            </TabsContent>

            <TabsContent value="documents" className="pt-4">
              <div className="rounded-lg border bg-card p-4">
                {docAttachments.length > 0 ? (
                  <div className="space-y-2">
                    {docAttachments.map((att, i) => (
                      <a
                        key={i}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-lg border p-3 hover:bg-secondary transition-colors"
                      >
                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">{att.name}</span>
                      </a>
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
                      <a
                        key={i}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative aspect-square rounded-lg overflow-hidden border bg-muted"
                      >
                        <img
                          src={att.url}
                          alt={att.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                          <p className="text-xs text-white truncate">{att.name}</p>
                        </div>
                      </a>
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
                  <EventLogList logs={logs} />
                ) : (
                  <p className="text-sm text-muted-foreground">Ingen historikk registrert.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
