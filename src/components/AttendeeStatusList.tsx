import { type AttendeeStatus } from "@/lib/mock-data";
import { useTechnicians } from "@/hooks/useTechnicians";
import { JobStatusBadge } from "./JobStatusBadge";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { User, Clock } from "lucide-react";

interface AttendeeStatusListProps {
  attendeeStatuses: AttendeeStatus[];
}

export function AttendeeStatusList({ attendeeStatuses }: AttendeeStatusListProps) {
  const { technicians } = useTechnicians();
  return (
    <div className="space-y-2">
      {attendeeStatuses.map((att) => {
        const tech = technicians.find((t) => t.id === att.technicianId);
        if (!tech) return null;

        return (
          <div key={att.technicianId} className="rounded-md border bg-secondary/40 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-3 w-3" />
                </div>
                <span className="text-sm font-medium truncate">{tech.name}</span>
              </div>
              <JobStatusBadge status={att.status} />
            </div>

            {att.status === "change-request" && att.proposedStart && att.proposedEnd && (
              <div className="ml-8 rounded bg-status-change-request/10 px-2.5 py-1.5 text-xs space-y-0.5">
                <p className="font-medium text-status-change-request">Foreslått nytt tidspunkt:</p>
                <div className="flex items-center gap-1.5 text-foreground">
                  <Clock className="h-3 w-3 text-status-change-request" />
                  <span>
                    {format(att.proposedStart, "EEEE d. MMM", { locale: nb })},{" "}
                    {format(att.proposedStart, "HH:mm")} – {format(att.proposedEnd, "HH:mm")}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
