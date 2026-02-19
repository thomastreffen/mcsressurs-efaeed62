import { cn } from "@/lib/utils";
import { JOB_STATUS_CONFIG, type JobStatus } from "@/lib/job-status";

export function StatusDot({ status }: { status: JobStatus }) {
  const config = JOB_STATUS_CONFIG[status];
  return (
    <span className={cn("inline-block h-2.5 w-2.5 rounded-full", config?.dotClass ?? "bg-muted")} />
  );
}
