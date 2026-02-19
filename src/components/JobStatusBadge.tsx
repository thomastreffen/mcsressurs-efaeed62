import { cn } from "@/lib/utils";
import { JOB_STATUS_CONFIG, type JobStatus } from "@/lib/job-status";

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const config = JOB_STATUS_CONFIG[status];
  if (!config) return null;
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
