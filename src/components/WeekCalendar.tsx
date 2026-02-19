import { addDays, format, startOfWeek, isSameDay } from "date-fns";
import { nb } from "date-fns/locale";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { JOB_STATUS_CONFIG, type JobStatus } from "@/lib/job-status";
import { cn } from "@/lib/utils";
import { JobStatusBadge } from "./JobStatusBadge";
import type { Job } from "@/lib/mock-data";

interface WeekCalendarProps {
  technicianId: string;
  onJobClick?: (job: Job) => void;
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}t ${m}m` : `${h}t`;
}

export function WeekCalendar({ technicianId, onJobClick }: WeekCalendarProps) {
  const { getJobsForDay, getBookedMinutesForDay, loading } = useCalendarEvents(technicianId);
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();
  const WORK_DAY_MINUTES = 480;

  return (
    <div className="grid grid-cols-7 gap-px rounded-xl border bg-border overflow-hidden">
      {days.map((day) => {
        const dayJobs = getJobsForDay(day);
        const isToday = isSameDay(day, today);
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
        const bookedMinutes = getBookedMinutesForDay(day);
        const utilizationPct = Math.min(100, Math.round((bookedMinutes / WORK_DAY_MINUTES) * 100));

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

            {!isWeekend && bookedMinutes > 0 && (
              <div className="px-2 pt-1.5 pb-0.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                  <span>{formatHours(bookedMinutes)} / 8t</span>
                  <span>{utilizationPct}%</span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      utilizationPct >= 100 ? "bg-destructive" :
                      utilizationPct >= 75 ? "bg-status-requested" :
                      "bg-status-approved"
                    )}
                    style={{ width: `${utilizationPct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex-1 p-1.5 space-y-1">
              {dayJobs.map((job) => {
                const statusConfig = JOB_STATUS_CONFIG[job.status];
                return (
                  <button
                    key={job.id}
                    onClick={() => onJobClick?.(job)}
                    className={cn(
                      "w-full rounded-md border-l-[3px] bg-secondary/60 p-2 text-left transition-colors hover:bg-secondary",
                      statusConfig?.borderClass
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
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
