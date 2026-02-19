import { useParams, useNavigate } from "react-router-dom";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { TopBar } from "@/components/TopBar";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { AttendeeStatusList } from "@/components/AttendeeStatusList";
import { AttachmentList } from "@/components/AttachmentList";
import { AuditInfo } from "@/components/AuditInfo";
import { EventLogList } from "@/components/EventLogList";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { jobs, getEventLogs, type Job } from "@/lib/mock-data";
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
} from "lucide-react";
import { toast } from "sonner";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const job = useMemo(() => jobs.find((j) => j.id === id), [id]);

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
          {/* Back button */}
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            Tilbake
          </Button>

          {/* Header */}
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

              {/* Status change */}
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

            {/* Key info cards */}
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
                  {job.technicianIds.length} tildelt
                </p>
              </div>
            </div>
          </header>

          {/* Tabs */}
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Oversikt</TabsTrigger>
              <TabsTrigger value="documents">Dokumenter</TabsTrigger>
              <TabsTrigger value="images">Bilder</TabsTrigger>
              <TabsTrigger value="communication">Kommunikasjon</TabsTrigger>
              <TabsTrigger value="history">Historikk</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 pt-4">
              {/* Description */}
              {job.description && (
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="text-sm font-medium mb-2">Beskrivelse</h3>
                  <p className="text-sm text-muted-foreground">{job.description}</p>
                </div>
              )}

              {/* Attendee statuses */}
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <h3 className="text-sm font-medium">Montørstatus</h3>
                <AttendeeStatusList attendeeStatuses={job.attendeeStatuses} />
              </div>

              {/* Audit */}
              <div className="rounded-lg border bg-card p-4">
                <AuditInfo job={job} />
              </div>
            </TabsContent>

            <TabsContent value="documents" className="pt-4">
              <div className="rounded-lg border bg-card p-4">
                {job.attachments && job.attachments.length > 0 ? (
                  <AttachmentList attachments={job.attachments} />
                ) : (
                  <p className="text-sm text-muted-foreground">Ingen dokumenter lastet opp.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="images" className="pt-4">
              <div className="rounded-lg border bg-card p-6 text-center">
                <p className="text-sm text-muted-foreground">Bildeopplasting kommer snart.</p>
              </div>
            </TabsContent>

            <TabsContent value="communication" className="pt-4">
              <div className="rounded-lg border bg-card p-6 text-center">
                <p className="text-sm text-muted-foreground">Kommunikasjonsmodul kommer snart.</p>
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
