import { useRef, useCallback, useMemo, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventInput, EventDropArg, DateSelectArg, EventClickArg } from "@fullcalendar/core";
import { nb } from "date-fns/locale";
import { useCalendarEvents, type CalendarEvent } from "@/hooks/useCalendarEvents";
import type { ExternalBusySlot } from "@/hooks/useExternalBusy";

interface TechLookup {
  name: string;
  color: string | null;
}

interface ResourceCalendarProps {
  technicianId: string | null;
  referenceDate: Date;
  technicianMap: Map<string, TechLookup>;
  getBusySlotsForDay?: (date: Date) => ExternalBusySlot[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateSelect?: (start: Date, end: Date) => void;
  onEventDrop?: (eventId: string, newStart: Date, newEnd: Date) => void;
  onEventResize?: (eventId: string, newStart: Date, newEnd: Date) => void;
  isAdmin?: boolean;
}

export function ResourceCalendar({
  technicianId,
  referenceDate,
  technicianMap,
  getBusySlotsForDay,
  onEventClick,
  onDateSelect,
  onEventDrop,
  onEventResize,
  isAdmin = false,
}: ResourceCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const { events: calendarEvents, loading } = useCalendarEvents(technicianId, referenceDate);

  // Navigate FullCalendar when referenceDate changes
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api) {
      api.gotoDate(referenceDate);
    }
  }, [referenceDate]);

  // Status color map
  const statusColors: Record<string, { bg: string; border: string; text: string }> = {
    planned: { bg: "#1E3A8A", border: "#1E3A8A", text: "#FFFFFF" },
    requested: { bg: "#1E3A8A", border: "#1E3A8A", text: "#FFFFFF" },
    scheduled: { bg: "#1E3A8A", border: "#2563EB", text: "#FFFFFF" },
    in_progress: { bg: "#065F46", border: "#065F46", text: "#FFFFFF" },
    completed: { bg: "#E5E7EB", border: "#D1D5DB", text: "#374151" },
    done: { bg: "#E5E7EB", border: "#D1D5DB", text: "#374151" },
    invoiced: { bg: "#E5E7EB", border: "#D1D5DB", text: "#6B7280" },
  };
  const defaultStatusColor = { bg: "#1E3A8A", border: "#1E3A8A", text: "#FFFFFF" };

  // Map CalendarEvents to FullCalendar EventInput
  const fcEvents: EventInput[] = useMemo(() => {
    const internal: EventInput[] = calendarEvents.map((ev) => {
      const techNames = ev.technicians.map((t) => t.name.split(" ")[0]).join(", ");
      const colors = statusColors[ev.status] || defaultStatusColor;

      return {
        id: ev.id,
        title: ev.title.replace("SERVICE – ", ""),
        start: ev.start,
        end: ev.end,
        backgroundColor: colors.bg,
        borderColor: colors.border,
        textColor: colors.text,
        extendedProps: {
          calendarEvent: ev,
          customer: ev.customer,
          status: ev.status,
          techNames,
          statusColors: colors,
        },
        editable: isAdmin,
      };
    });

    // Add external busy slots as foreground events (not background) for better visibility
    if (getBusySlotsForDay) {
      const weekStart = new Date(referenceDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        const slots = getBusySlotsForDay(day);
        for (const slot of slots) {
          const tech = technicianMap.get(slot.technicianId);
          internal.push({
            id: `busy-${slot.technicianId}-${slot.start.getTime()}`,
            title: tech?.name ? `${tech.name.split(" ")[0]} – opptatt` : "Opptatt",
            start: slot.start,
            end: slot.end,
            backgroundColor: "#F3F4F6",
            borderColor: "#D1D5DB",
            textColor: "#9CA3AF",
            editable: false,
            extendedProps: { isBusy: true },
          });
        }
      }
    }

    return internal;
  }, [calendarEvents, getBusySlotsForDay, technicianMap, referenceDate, isAdmin]);

  const handleEventClick = useCallback((info: EventClickArg) => {
    const calEvent = info.event.extendedProps.calendarEvent as CalendarEvent | undefined;
    if (calEvent && !info.event.extendedProps.isBusy) {
      onEventClick?.(calEvent);
    }
  }, [onEventClick]);

  const handleDateSelect = useCallback((info: DateSelectArg) => {
    if (isAdmin) {
      onDateSelect?.(info.start, info.end);
    }
  }, [isAdmin, onDateSelect]);

  const handleEventDrop = useCallback((info: EventDropArg) => {
    if (info.event.extendedProps.isBusy) {
      info.revert();
      return;
    }
    const eventId = info.event.id;
    const newStart = info.event.start!;
    const newEnd = info.event.end!;
    onEventDrop?.(eventId, newStart, newEnd);
  }, [onEventDrop]);

  const handleEventResize = useCallback((info: any) => {
    if (info.event.extendedProps.isBusy) {
      info.revert();
      return;
    }
    const eventId = info.event.id;
    const newStart = info.event.start!;
    const newEnd = info.event.end!;
    onEventResize?.(eventId, newStart, newEnd);
  }, [onEventResize]);

  return (
    <div className="fc-wrapper rounded-2xl border border-border/40 bg-card shadow-sm overflow-hidden">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        initialDate={referenceDate}
        headerToolbar={false}
        locale="nb"
        firstDay={1}
        height="auto"
        allDaySlot={false}
        slotMinTime="06:00:00"
        slotMaxTime="20:00:00"
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
        eventMinHeight={36}
        eventContent={(arg) => {
          const props = arg.event.extendedProps;
          if (props.isBusy) {
            return (
              <div className="fc-event-external flex items-center gap-1.5 px-2 py-1.5 text-[11px] cursor-default select-none" style={{ color: "#9CA3AF" }}>
                <span className="opacity-60">🔒</span>
                <span className="truncate">{arg.event.title}</span>
              </div>
            );
          }
          return (
            <div className="fc-event-internal px-2 py-1.5 overflow-hidden h-full cursor-grab active:cursor-grabbing select-none">
              <p className="text-[13px] font-bold leading-tight truncate">
                {arg.event.title}
              </p>
              {props.customer && (
                <p className="text-[11px] opacity-80 truncate mt-0.5">{props.customer}</p>
              )}
              <div className="flex items-center gap-2 mt-1 text-[10px] opacity-70">
                {props.techNames && (
                  <span className="truncate">👤 {props.techNames}</span>
                )}
                <span className="shrink-0">{arg.timeText}</span>
              </div>
            </div>
          );
        }}
        dayHeaderContent={(arg) => {
          const isToday = new Date().toDateString() === arg.date.toDateString();
          return (
            <div className={`py-2.5 text-center ${isToday ? "text-primary font-bold" : ""}`}>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {arg.date.toLocaleDateString("nb-NO", { weekday: "short" })}
              </div>
              <div className={`text-lg font-bold ${isToday ? "text-primary" : ""}`}>
                {arg.date.getDate()}
              </div>
            </div>
          );
        }}
        loading={(isLoading) => {
          // Could show skeleton here
        }}
      />
    </div>
  );
}
