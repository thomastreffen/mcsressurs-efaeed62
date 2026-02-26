import { useRef, useCallback, useMemo, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type { EventInput, EventDropArg, DateSelectArg, EventClickArg } from "@fullcalendar/core";
import { useCalendarEvents, type CalendarEvent } from "@/hooks/useCalendarEvents";
import type { ExternalBusySlot } from "@/hooks/useExternalBusy";
import type { DayCapacity } from "@/hooks/useCapacity";
import { Lock } from "lucide-react";

interface TechLookup {
  name: string;
  color: string | null;
}

interface ResourceCalendarProps {
  technicianId: string | null;
  referenceDate: Date;
  calendarView?: string;
  technicianMap: Map<string, TechLookup>;
  getBusySlotsForDay?: (date: Date) => ExternalBusySlot[];
  dayCapacities?: DayCapacity[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateSelect?: (start: Date, end: Date) => void;
  onEventDrop?: (eventId: string, newStart: Date, newEnd: Date) => void;
  onEventResize?: (eventId: string, newStart: Date, newEnd: Date) => void;
  isAdmin?: boolean;
}

/** Merge overlapping external slots into contiguous blocks */
function mergeExternalSlots(slots: ExternalBusySlot[]): ExternalBusySlot[] {
  if (slots.length <= 1) return slots;
  const sorted = [...slots].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: ExternalBusySlot[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      if (sorted[i].end > last.end) last.end = sorted[i].end;
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}

/** Vivid, distinct colors for each technician – Google Calendar style */
const GCAL_PALETTE = [
  "#D50000", "#F4511E", "#E67C73", "#F09300",
  "#009688", "#0B8043", "#33B679", "#7CB342",
  "#039BE5", "#3F51B5", "#7986CB", "#8E24AA",
  "#616161", "#795548",
];

/** Status indicator dot colors */
const statusDotColors: Record<string, string> = {
  planned: "#1E3A8A",
  requested: "#D97706",
  scheduled: "#2563EB",
  in_progress: "#059669",
  completed: "#6B7280",
  done: "#6B7280",
  invoiced: "#9CA3AF",
};

export function ResourceCalendar({
  technicianId,
  referenceDate,
  calendarView = "timeGridWeek",
  technicianMap,
  getBusySlotsForDay,
  dayCapacities,
  onEventClick,
  onDateSelect,
  onEventDrop,
  onEventResize,
  isAdmin = false,
}: ResourceCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const { events: calendarEvents } = useCalendarEvents(technicianId, referenceDate);

  const isMonthView = calendarView === "dayGridMonth";
  const isDayView = calendarView === "timeGridDay";

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api) {
      api.gotoDate(referenceDate);
      if (api.view.type !== calendarView) {
        api.changeView(calendarView);
      }
    }
  }, [referenceDate, calendarView]);

  // Scroll to current time in day view
  useEffect(() => {
    if (isDayView) {
      const api = calendarRef.current?.getApi();
      if (api) api.scrollToTime(new Date().toTimeString().slice(0, 8));
    }
  }, [isDayView, calendarView]);

  // Build a stable color assignment per technician (Google Calendar style)
  const techColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    for (const [techId, info] of technicianMap) {
      map.set(techId, info.color || GCAL_PALETTE[idx % GCAL_PALETTE.length]);
      idx++;
    }
    return map;
  }, [technicianMap]);

  const fcEvents: EventInput[] = useMemo(() => {
    const result: EventInput[] = calendarEvents.map((ev) => {
      const techNames = ev.technicians.map((t) => t.name.split(" ")[0]).join(", ");
      const firstTechId = ev.technicians[0]?.id;
      const baseColor = (firstTechId && techColorMap.get(firstTechId)) || GCAL_PALETTE[0];
      return {
        id: ev.id,
        title: ev.title.replace("SERVICE – ", ""),
        start: ev.start,
        end: ev.end,
        backgroundColor: baseColor,
        borderColor: baseColor,
        textColor: "#FFFFFF",
        extendedProps: {
          calendarEvent: ev,
          customer: ev.customer,
          status: ev.status,
          techNames,
          baseColor,
          statusDot: statusDotColors[ev.status] || "#FFFFFF",
        },
        editable: isAdmin,
      };
    });

    // External busy slots – merged and solid
    let missingNameCount = 0;
    if (getBusySlotsForDay) {
      const weekStart = new Date(referenceDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      const daysToRender = isMonthView ? 42 : 7;
      for (let i = 0; i < daysToRender; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        const rawSlots = getBusySlotsForDay(day);
        const byTech = new Map<string, ExternalBusySlot[]>();
        for (const s of rawSlots) {
          const arr = byTech.get(s.technicianId) || [];
          arr.push(s);
          byTech.set(s.technicianId, arr);
        }
        for (const [techId, techSlots] of byTech) {
          // Only show busy slots for technicians in the active plannable set
          const tech = technicianMap.get(techId);
          if (!tech) {
            console.debug(`[ResourceCalendar] Skipping ${techSlots.length} busy slot(s) for non-plannable techId=${techId}`);
            continue;
          }
          const merged = mergeExternalSlots(techSlots);
          for (const slot of merged) {
            const techName = tech?.name?.trim();
            const displayName = techName
              ? techName.split(" ")[0]
              : "Ukjent montør";
            if (!techName) {
              missingNameCount++;
              console.warn(`[ResourceCalendar] Busy slot missing technician name – techId=${techId}, slot=${slot.start.toISOString()}`);
            }
            result.push({
              id: `busy-${techId}-${slot.start.getTime()}`,
              title: `${displayName} – opptatt`,
              start: slot.start,
              end: slot.end,
              backgroundColor: "#D1D5DB",
              borderColor: "#9CA3AF",
              textColor: "#4B5563",
              editable: false,
              extendedProps: {
                isBusy: true,
                techName: displayName,
              },
            });
          }
        }
      }
    }

    if (missingNameCount > 0) {
      console.warn(`[ResourceCalendar] ${missingNameCount} busy slot(s) rendered with missing technician displayName`);
    }

    return result;
  }, [calendarEvents, getBusySlotsForDay, technicianMap, techColorMap, referenceDate, isAdmin, isMonthView]);

  const handleEventClick = useCallback((info: EventClickArg) => {
    const calEvent = info.event.extendedProps.calendarEvent as CalendarEvent | undefined;
    if (calEvent && !info.event.extendedProps.isBusy) onEventClick?.(calEvent);
  }, [onEventClick]);

  const handleDateSelect = useCallback((info: DateSelectArg) => {
    if (isAdmin) onDateSelect?.(info.start, info.end);
  }, [isAdmin, onDateSelect]);

  const handleEventDrop = useCallback((info: EventDropArg) => {
    if (info.event.extendedProps.isBusy) { info.revert(); return; }
    onEventDrop?.(info.event.id, info.event.start!, info.event.end!);
  }, [onEventDrop]);

  const handleEventResize = useCallback((info: any) => {
    if (info.event.extendedProps.isBusy) { info.revert(); return; }
    onEventResize?.(info.event.id, info.event.start!, info.event.end!);
  }, [onEventResize]);

  return (
    <div className="fc-wrapper rounded-2xl border border-border/40 bg-card shadow-sm overflow-hidden">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
        initialView={calendarView}
        initialDate={referenceDate}
        headerToolbar={false}
        locale="nb"
        firstDay={1}
        height="auto"
        allDaySlot={false}
        slotMinTime="07:00:00"
        slotMaxTime="16:00:00"
        slotDuration="00:30:00"
        slotLabelInterval="01:00:00"
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        weekends={true}
        nowIndicator={true}
        selectable={isAdmin}
        selectMirror={true}
        editable={isAdmin}
        eventDurationEditable={isAdmin}
        eventStartEditable={isAdmin}
        snapDuration="00:15:00"
        events={fcEvents}
        eventClick={handleEventClick}
        select={handleDateSelect}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
        slotEventOverlap={false}
        eventOverlap={false}
        eventMaxStack={4}
        eventMinHeight={36}
        eventContent={(arg) => {
          const props = arg.event.extendedProps;

          // List view – simple text
          if (calendarView === "listWeek") return undefined;

          // Month view – compact
          if (isMonthView) {
            if (props.isBusy) {
              return (
                <div className="flex items-center gap-1 px-1 py-0.5 text-[10px] truncate">
                   <Lock className="h-2.5 w-2.5 opacity-50 shrink-0" />
                   <span className="truncate">{props.techName || "Ukjent montør"}</span>
                </div>
              );
            }
            return (
              <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: props.baseColor }}
                />
                <span className="text-[10px] font-semibold truncate text-white">{arg.event.title}</span>
                {props.techNames && <span className="text-[9px] opacity-60 truncate">· {props.techNames}</span>}
              </div>
            );
          }

          // Day/Week view – detailed
          if (props.isBusy) {
            return (
              <div className="fc-event-external flex items-center gap-1.5 px-2 py-1.5 cursor-default select-none">
                <Lock className="h-3 w-3 opacity-50 shrink-0" />
                <div className="min-w-0 flex-1">
                  {props.techName && (
                    <p className="text-[11px] font-bold truncate">{props.techName}</p>
                  )}
                  <span className="text-[10px] font-medium truncate block">Opptatt – ekstern</span>
                  <span className="text-[9px] opacity-70">{arg.timeText}</span>
                </div>
              </div>
            );
          }
          return (
            <div
              className="fc-event-internal px-2 py-1.5 overflow-hidden h-full cursor-grab active:cursor-grabbing select-none"
            >
              <div className="flex items-center gap-1.5">
                {props.techNames && (
                  <p className="text-[12px] font-bold leading-tight truncate text-white/90">
                    {props.techNames}
                  </p>
                )}
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0 border border-white/30"
                  style={{ backgroundColor: props.statusDot }}
                />
              </div>
              <p className="text-[13px] font-semibold leading-tight truncate mt-0.5 text-white">
                {arg.event.title}
              </p>
              {props.customer && (
                <p className="text-[11px] text-white/75 truncate mt-0.5">{props.customer}</p>
              )}
              <span className="text-[10px] text-white/60 mt-0.5 block">{arg.timeText}</span>
            </div>
          );
        }}
        dayHeaderContent={(arg) => {
          const isToday = new Date().toDateString() === arg.date.toDateString();
          const dayCap = dayCapacities?.find(
            (d) => d.date.toDateString() === arg.date.toDateString()
          );
          return (
            <div className={`py-2 text-center ${isToday ? "text-primary font-bold" : ""}`}>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {arg.date.toLocaleDateString("nb-NO", { weekday: "short" })}
              </div>
              <div className={`text-lg font-bold ${isToday ? "text-primary" : ""}`}>
                {arg.date.getDate()}
              </div>
              {dayCap && !isMonthView && (
                <div className="mt-1 flex flex-col items-center gap-0.5">
                  <div className="w-10 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(dayCap.percent, 100)}%`,
                        backgroundColor: dayCap.color,
                      }}
                    />
                  </div>
                  <span className="text-[9px] font-semibold" style={{ color: dayCap.color }}>
                    {dayCap.label}
                  </span>
                </div>
              )}
            </div>
          );
        }}
        loading={() => {}}
      />
    </div>
  );
}