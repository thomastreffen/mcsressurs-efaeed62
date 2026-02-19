import { StatusDot } from "./StatusDot";
import { ALL_STATUSES, JOB_STATUS_CONFIG } from "@/lib/job-status";

export function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {ALL_STATUSES.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <StatusDot status={s} /> {JOB_STATUS_CONFIG[s].label}
        </span>
      ))}
    </div>
  );
}
