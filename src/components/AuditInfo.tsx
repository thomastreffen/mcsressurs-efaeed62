import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { type Job } from "@/lib/mock-data";

interface AuditInfoProps {
  job: Job;
}

export function AuditInfo({ job }: AuditInfoProps) {
  if (!job.createdByName && !job.updatedByName) return null;

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {job.createdByName && job.createdAt && (
        <p>
          Opprettet av <span className="text-foreground font-medium">{job.createdByName}</span> –{" "}
          {format(job.createdAt, "d. MMM yyyy HH:mm", { locale: nb })}
        </p>
      )}
      {job.updatedByName && job.updatedAt && (
        <p>
          Sist endret av <span className="text-foreground font-medium">{job.updatedByName}</span> –{" "}
          {format(job.updatedAt, "d. MMM yyyy HH:mm", { locale: nb })}
        </p>
      )}
      {job.cancelledByName && job.cancelledAt && (
        <p className="text-destructive">
          Avlyst av <span className="font-medium">{job.cancelledByName}</span> –{" "}
          {format(job.cancelledAt, "d. MMM yyyy HH:mm", { locale: nb })}
        </p>
      )}
    </div>
  );
}
