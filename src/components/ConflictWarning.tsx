import { technicians, type Job } from "@/lib/mock-data";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";

interface ConflictWarningProps {
  conflicts: { technicianId: string; job: Job }[];
}

export function ConflictWarning({ conflicts }: ConflictWarningProps) {
  if (conflicts.length === 0) return null;

  return (
    <div className="rounded-lg border-2 border-destructive/30 bg-destructive/5 p-3 space-y-2">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-4 w-4" />
        <p className="text-sm font-medium">Overlappende jobber</p>
      </div>
      <div className="space-y-1">
        {conflicts.map(({ technicianId, job }) => {
          const tech = technicians.find((t) => t.id === technicianId);
          return (
            <p key={`${technicianId}-${job.id}`} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{tech?.name}</span> har allerede{" "}
              <span className="font-medium">"{job.title.replace("SERVICE – ", "")}"</span>{" "}
              {format(job.start, "HH:mm")}–{format(job.end, "HH:mm")}
            </p>
          );
        })}
      </div>
    </div>
  );
}
