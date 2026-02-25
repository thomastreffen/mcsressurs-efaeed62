import { useMemo, useCallback, memo } from "react";
import { addDays, format, startOfWeek, isSameDay, isToday as isDateToday, differenceInMinutes } from "date-fns";
import { nb } from "date-fns/locale";
import { useCalendarEvents, type CalendarEvent } from "@/hooks/useCalendarEvents";
import { JOB_STATUS_CONFIG, type JobStatus } from "@/lib/job-status";
import { cn } from "@/lib/utils";
import { JobStatusBadge } from "./JobStatusBadge";
import { AlertTriangle, Lock, MapPin } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ExternalBusySlot } from "@/hooks/useExternalBusy";

interface WeekCalendarProps {
  technicianId: string | null;
  referenceDate?: Date;
  onJobClick?: (job: CalendarEvent) => void;
  onDayClick?: (date: Date) => void;
  getBusySlotsForDay?: (date: Date) => ExternalBusySlot[];
  getExternalBusyMinutesForDay?: (date: Date) => number;
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
  const primaryTech = job.technicians?.[0];
  const techColor = primaryTech?.color || "#6366f1";

  return (
    <button
      onClick={() => onClick?.(job)}
      className={cn(
        "w-full rounded-lg border-l-[4px] p-2.5 text-left transition-all group",
        "shadow-sm hover:shadow-md hover:scale-[1.01]",
        isTimeChange
          ? "ring-1 ring-status-time-change-proposed/40"
          : ""
      )}
      style={{
        borderLeftColor: techColor,
        backgroundColor: `${techColor}08`,
      }}
    >
      <div className="flex items-center gap-1.5">
        {isTimeChange && (
          <AlertTriangle className="h-3 w-3 shrink-0 text-status-time-change-proposed" />
        )}
        <p className="text-xs font-semibold leading-tight truncate text-foreground">
          {job.title.replace("SERVICE – ", "")}
        </p>
      </div>

      {job.customer && (
        <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
          {job.customer}
        </p>
      )}

      <p className="mt-1 text-[11px] font-medium text-foreground/70">
        {format(job.start, "HH:mm")} – {format(job.end, "HH:mm")}
      </p>

      {!technicianId && job.technicians.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
          {job.technicians.slice(0, 3).map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: `${t.color || "#6366f1"}18`,
                color: t.color || "#6366f1",
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: t.color || "#6366f1" }}
              />
              {t.name.split(" ")[0]}
            </span>
          ))}
          {job.technicians.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{job.technicians.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="mt-1.5">
        <JobStatusBadge status={job.status} />
      </div>
    </button>
  );
});

const BusyBlock = memo(function BusyBlock({ slot }: { slot: ExternalBusySlot }) {
  return (
    <div className="w-full rounded-lg border border-dashed border-muted-foreground/30 p-2 bg-muted/60 backdrop-blur-sm">
      <div className="flex items-center gap-1.5">
        <Lock className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        <p className="text-[11px] font-medium text-muted-foreground">Opptatt (ekstern)</p>
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground/60">
        {format(slot.start, "HH:mm")} – {format(slot.end, "HH:mm")}
      </p>
    </div>
  );
});

export function WeekCalendar({
  technicianId,
  referenceDate,
  onJobClick,
  onDayClick,
  getBusySlotsForDay,
  getExternalBusyMinutesForDay,
}: WeekCalendarProps) {
  const { getJobsForDay, getBookedMinutesForDay, loading } = useCalendarEvents(technicianId, referenceDate);
  const isMobile = useIsMobile();

  const weekStart = useMemo(
    () => startOfWeek(referenceDate ?? new Date(), { weekStartsOn: 1 }),
    [(referenceDate ?? new Date()).toDateString()]
  );

  const WORK_DAY_MINUTES = 480;
  const dayCount = isMobile ? 5 : 7;
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => addDays(weekStart, i)),
    [weekStart, dayCount]
  );

  if (loading) {
    return (
      <div className={cn(
        "grid gap-[1px] rounded-2xl border border-border/40 bg-border/40 overflow-hidden",
        isMobile ? "grid-cols-1" : "grid-cols-7"
      )}>
        {days.map((day) => (
          <div key={day.toISOString()} className="min-h-[140px] bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn(
      "grid gap-[1px] rounded-2xl border border-border/40 bg-border/40 overflow-hidden shadow-sm",
      isMobile ? "grid-cols-1" : "grid-cols-7"
    )}>
      {days.map((day) => {
        const dayJobs = getJobsForDay(day);
        const isToday = isDateToday(day);
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
        const bookedMinutes = getBookedMinutesForDay(day);
        const externalMinutes = getExternalBusyMinutesForDay?.(day) ?? 0;
        const totalMinutes = bookedMinutes + externalMinutes;
        const utilizationPct = Math.min(100, Math.round((totalMinutes / WORK_DAY_MINUTES) * 100));
        const dayBusySlots = getBusySlotsForDay?.(day) ?? [];

        return (
          <div
            key={day.toISOString()}
            className={cn(
              "min-h-[140px] sm:min-h-[180px] flex flex-col",
              isWeekend ? "bg-muted/30" : "bg-card"
            )}
          >
            {/* Day header */}
            <div
              className={cn(
                "px-3 py-2.5 text-center border-b border-border/30 select-none",
                isToday
                  ? "bg-primary text-primary-foreground"
                  : "bg-card"
              )}
            >
              <p className={cn(
                "text-[10px] font-semibold uppercase tracking-widest",
                isToday ? "text-primary-foreground/80" : "text-muted-foreground"
              )}>
                {format(day, "EEEE", { locale: nb })}
              </p>
              <p className={cn(
                "text-lg font-bold",
                isToday ? "text-primary-foreground" : "text-foreground"
              )}>
                {format(day, "d")}
              </p>
            </div>

            {/* Utilization bar */}
            {!isWeekend && (
              <div className="px-2.5 pt-2 pb-1">
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className={cn(
                    "font-medium",
                    totalMinutes > 0 ? "text-foreground/60" : "text-muted-foreground/40"
                  )}>
                    {totalMinutes > 0 ? formatHours(totalMinutes) : "Ledig"}
                  </span>
                  {totalMinutes > 0 && (
                    <span className={cn(
                      "font-bold tabular-nums",
                      utilizationPct >= 100 ? "text-destructive" :
                      utilizationPct >= 75 ? "text-amber-600" :
                      "text-emerald-600"
                    )}>
                      {utilizationPct}%
                    </span>
                  )}
                </div>
                <div className="h-1.5 rounded-full bg-muted/80 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      utilizationPct >= 100 ? "bg-destructive" :
                      utilizationPct >= 75 ? "bg-amber-500" :
                      utilizationPct > 0 ? "bg-emerald-500" :
                      "bg-transparent"
                    )}
                    style={{ width: `${utilizationPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Day content */}
            <div
              className={cn(
                "flex-1 p-2 space-y-1.5",
                onDayClick && !isWeekend && "cursor-pointer hover:bg-primary/[0.03] transition-colors"
              )}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                if (!isWeekend) onDayClick?.(day);
              }}
            >
              {dayBusySlots.map((slot, i) => (
                <BusyBlock key={`busy-${i}`} slot={slot} />
              ))}
              {dayJobs.map((job) => (
                <CalendarCard
                  key={job.id}
                  job={job}
                  technicianId={technicianId}
                  onClick={onJobClick}
                />
              ))}
              {dayJobs.length === 0 && dayBusySlots.length === 0 && onDayClick && !isWeekend && (
                <div className="flex items-center justify-center h-full min-h-[50px] opacity-0 hover:opacity-50 transition-opacity">
                  <span className="text-[11px] text-muted-foreground font-medium">+ Legg til</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
