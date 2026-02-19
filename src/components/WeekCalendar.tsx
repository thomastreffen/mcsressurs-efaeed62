import { useMemo, useCallback, memo } from "react";
import { addDays, format, startOfWeek, isSameDay } from "date-fns";
import { nb } from "date-fns/locale";
import { useCalendarEvents, type CalendarEvent } from "@/hooks/useCalendarEvents";
import { JOB_STATUS_CONFIG, type JobStatus } from "@/lib/job-status";
import { cn } from "@/lib/utils";
import { JobStatusBadge } from "./JobStatusBadge";
import { AlertTriangle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface WeekCalendarProps {
  technicianId: string | null;
  onJobClick?: (job: CalendarEvent) => void;
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}t ${m}m` : `${h}t`;
}

const CalendarCard = memo(function CalendarCard({
  job,
  technicianId,
  onClick,
}: {
  job: CalendarEvent;
  technicianId: string | null;
  onClick?: (job: CalendarEvent) => void;
}) {
  const statusConfig = JOB_STATUS_CONFIG[job.status];
  const isTimeChange = job.status === "time_change_proposed";
  const techColor = job.technicians?.[0]?.color;

  return (
    <button
      onClick={() => onClick?.(job)}
      className={cn(
        "w-full rounded-md border-l-[3px] p-2 text-left transition-colors",
        isTimeChange
          ? "bg-status-time-change-proposed/15 ring-1 ring-status-time-change-proposed/40 hover:bg-status-time-change-proposed/25"
          : "bg-secondary/60 hover:bg-secondary",
        !techColor && statusConfig?.borderClass
      )}
      style={techColor ? { borderLeftColor: techColor } : undefined}
    >
      <div className="flex items-center gap-1">
        {isTimeChange && (
          <AlertTriangle className="h-3 w-3 shrink-0 text-status-time-change-proposed" />
        )}
        <p className="text-xs font-medium leading-tight truncate">
          {job.title.replace("SERVICE – ", "")}
        </p>
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {format(job.start, "HH:mm")} – {format(job.end, "HH:mm")}
      </p>
      {!technicianId && job.technicians.length > 0 && (
        <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
          {job.technicians.map((t) => t.name.split(" ")[0]).join(", ")}
        </p>
      )}
      <div className="mt-1">
        <JobStatusBadge status={job.status} />
      </div>
    </button>
  );
});

export function WeekCalendar({ technicianId, onJobClick }: WeekCalendarProps) {
  const { getJobsForDay, getBookedMinutesForDay, loading } = useCalendarEvents(technicianId);
  const isMobile = useIsMobile();
  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const today = new Date();
  const WORK_DAY_MINUTES = 480;

  // Mobile: show 5 weekdays. Desktop: show 7
  const dayCount = isMobile ? 5 : 7;
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => addDays(weekStart, i)),
    [weekStart, dayCount]
  );

  if (loading) {
    return (
      <div className={cn(
        "grid gap-px rounded-xl border bg-border overflow-hidden",
        isMobile ? "grid-cols-1" : "grid-cols-7"
      )}>
        {days.map((day) => (
          <div key={day.toISOString()} className="min-h-[120px] bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn(
      "grid gap-px rounded-xl border bg-border overflow-hidden",
      isMobile ? "grid-cols-1" : "grid-cols-7"
    )}>
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
              "min-h-[120px] sm:min-h-[160px] flex flex-col",
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
              {dayJobs.map((job) => (
                <CalendarCard
                  key={job.id}
                  job={job}
                  technicianId={technicianId}
                  onClick={onJobClick}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
