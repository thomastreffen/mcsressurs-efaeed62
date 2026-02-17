import { cn } from "@/lib/utils";
import type { JobStatus } from "@/lib/mock-data";

const statusConfig: Record<JobStatus, { label: string; className: string }> = {
  accepted: {
    label: "Godtatt",
    className: "bg-status-accepted text-status-accepted-foreground",
  },
  pending: {
    label: "Ikke svart",
    className: "bg-status-pending text-status-pending-foreground",
  },
  declined: {
    label: "Avvist",
    className: "bg-status-declined text-status-declined-foreground",
  },
  "change-request": {
    label: "Endringsforespørsel",
    className: "bg-status-change-request text-status-change-request-foreground",
  },
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const config = statusConfig[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        config.className
      )}
    >
      {config.label}
    </span>
  );
}
