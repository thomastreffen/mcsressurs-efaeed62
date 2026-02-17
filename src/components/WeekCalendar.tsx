import { addDays, format, startOfWeek, isSameDay } from "date-fns";
import { nb } from "date-fns/locale";
import { getJobsForDay, type Job, type JobStatus } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { JobStatusBadge } from "./JobStatusBadge";

interface WeekCalendarProps {
  technicianId: string;
  onJobClick?: (job: Job) => void;
}

const statusBorder: Record<JobStatus, string> = {
  accepted: "border-l-status-accepted",
  pending: "border-l-status-pending",
  declined: "border-l-status-declined",
  "change-request": "border-l-status-change-request",
};

export function WeekCalendar({ technicianId, onJobClick }: WeekCalendarProps) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  return (
    <div className="grid grid-cols-7 gap-px rounded-xl border bg-border overflow-hidden">
      {days.map((day) => {
        const dayJobs = getJobsForDay(technicianId, day);
        const isToday = isSameDay(day, today);
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;

        return (
          <div
            key={day.toISOString()}
            className={cn(
              "min-h-[160px] flex flex-col",
              isWeekend ? "bg-muted/50" : "bg-card"
            )}
          >
            <div
              className={cn(
                "px-3 py-2 text-center border-b",
                isToday && "bg-primary text-primary-foreground"
              )}
            >
              <p className="text-xs font-medium uppercase">
                {format(day, "EEE", { locale: nb })}
              </p>
              <p className={cn("text-lg font-semibold", !isToday && "text-foreground")}>
                {format(day, "d")}
              </p>
            </div>
            <div className="flex-1 p-1.5 space-y-1">
              {dayJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => onJobClick?.(job)}
                  className={cn(
                    "w-full rounded-md border-l-[3px] bg-secondary/60 p-2 text-left transition-colors hover:bg-secondary",
                    statusBorder[job.status]
                  )}
                >
                  <p className="text-xs font-medium leading-tight truncate">
                    {job.title.replace("SERVICE – ", "")}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {format(job.start, "HH:mm")} – {format(job.end, "HH:mm")}
                  </p>
                  <div className="mt-1">
                    <JobStatusBadge status={job.status} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
