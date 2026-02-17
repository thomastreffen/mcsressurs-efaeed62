import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "./JobStatusBadge";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { technicians, type Job } from "@/lib/mock-data";
import {
  MapPin,
  Clock,
  User,
  Building2,
  CalendarCheck,
  CalendarX,
  Pencil,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

interface JobDetailSheetProps {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (job: Job) => void;
  onDuplicate?: (job: Job) => void;
}

export function JobDetailSheet({ job, open, onOpenChange, onEdit, onDuplicate }: JobDetailSheetProps) {
  if (!job) return null;

  const assignedTechs = technicians.filter((t) => job.technicianIds.includes(t.id));

  const handleAcceptProposal = () => {
    toast.success("Nytt tidspunkt godtatt");
    onOpenChange(false);
  };

  const handleDeclineProposal = () => {
    toast.info("Foreslått tidspunkt avvist, opprinnelig beholdt");
    onOpenChange(false);
  };

  const handleCancel = () => {
    toast.error("Jobb avlyst");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-left">{job.title}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="flex items-center justify-between">
            <JobStatusBadge status={job.status} />
            <div className="flex gap-1.5">
              {onEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { onOpenChange(false); onEdit(job); }}
                  className="gap-1.5"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Rediger
                </Button>
              )}
              {onDuplicate && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { onDuplicate(job); onOpenChange(false); }}
                  className="gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Dupliser
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3 text-sm">
              <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                {assignedTechs.map((t) => (
                  <p key={t.id} className="font-medium">{t.name} <span className="font-normal text-muted-foreground">({t.email})</span></p>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-3 text-sm">
              <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <p>{job.customer}</p>
            </div>

            <div className="flex items-start gap-3 text-sm">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <p>{job.address}</p>
            </div>

            <div className="flex items-start gap-3 text-sm">
              <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p>
                  {format(job.start, "EEEE d. MMMM yyyy", { locale: nb })}
                </p>
                <p className="text-muted-foreground">
                  {format(job.start, "HH:mm")} – {format(job.end, "HH:mm")}
                </p>
              </div>
            </div>
          </div>

          {job.description && (
            <div className="rounded-lg bg-secondary p-3">
              <p className="text-sm">{job.description}</p>
            </div>
          )}

          {job.status === "change-request" && job.proposedStart && job.proposedEnd && (
            <div className="rounded-lg border-2 border-status-change-request/30 bg-status-change-request/5 p-4 space-y-3">
              <p className="text-sm font-medium">Foreslått nytt tidspunkt:</p>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-status-change-request" />
                <span>
                  {format(job.proposedStart, "EEEE d. MMMM", { locale: nb })},{" "}
                  {format(job.proposedStart, "HH:mm")} –{" "}
                  {format(job.proposedEnd, "HH:mm")}
                </span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAcceptProposal} className="gap-1.5">
                  <CalendarCheck className="h-3.5 w-3.5" />
                  Godta
                </Button>
                <Button size="sm" variant="outline" onClick={handleDeclineProposal} className="gap-1.5">
                  <CalendarX className="h-3.5 w-3.5" />
                  Avvis
                </Button>
              </div>
            </div>
          )}

          <div className="pt-4 border-t flex gap-2">
            <Button variant="destructive" size="sm" onClick={handleCancel}>
              Avlys jobb
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
