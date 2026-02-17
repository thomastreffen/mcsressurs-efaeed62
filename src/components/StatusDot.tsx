import { cn } from "@/lib/utils";
import type { JobStatus } from "@/lib/mock-data";

const dotColors: Record<JobStatus, string> = {
  accepted: "bg-status-accepted",
  pending: "bg-status-pending",
  declined: "bg-status-declined",
  "change-request": "bg-status-change-request",
};

export function StatusDot({ status }: { status: JobStatus }) {
  return (
    <span className={cn("inline-block h-2.5 w-2.5 rounded-full", dotColors[status])} />
  );
}
