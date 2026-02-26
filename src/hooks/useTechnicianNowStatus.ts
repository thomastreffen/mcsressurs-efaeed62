import { useMemo } from "react";
import type { CalendarEvent } from "@/hooks/useCalendarEvents";
import type { ExternalBusySlot } from "@/hooks/useExternalBusy";
import { format } from "date-fns";

export interface TechNowStatus {
  state: "busy" | "free" | "free-until";
  label: string;
  until?: Date;
  source?: "internal" | "external";
}

/**
 * Computes real-time availability status for each technician.
 * Returns a map of techId -> TechNowStatus.
 */
export function useTechnicianNowStatus(
  events: CalendarEvent[],
  busySlots: ExternalBusySlot[],
  technicianIds: string[]
): Map<string, TechNowStatus> {
  return useMemo(() => {
    const now = new Date();
    const map = new Map<string, TechNowStatus>();

    for (const techId of technicianIds) {
      // Find active internal event
      const activeInternal = events.find(
        (ev) =>
          ev.start <= now &&
          ev.end > now &&
          ev.technicians.some((t) => t.id === techId)
      );

      // Find active external busy slot
      const activeExternal = busySlots.find(
        (s) => s.technicianId === techId && s.start <= now && s.end > now
      );

      if (activeInternal || activeExternal) {
        // Pick the one that ends later
        const internalEnd = activeInternal?.end;
        const externalEnd = activeExternal?.end;
        let endTime: Date;
        let source: "internal" | "external";

        if (internalEnd && externalEnd) {
          endTime = internalEnd > externalEnd ? internalEnd : externalEnd;
          source = internalEnd > externalEnd ? "internal" : "external";
        } else if (internalEnd) {
          endTime = internalEnd;
          source = "internal";
        } else {
          endTime = externalEnd!;
          source = "external";
        }

        map.set(techId, {
          state: "busy",
          label: `Opptatt til ${format(endTime, "HH:mm")}`,
          until: endTime,
          source,
        });
        continue;
      }

      // Find next event today
      const todayStr = now.toDateString();
      const upcomingInternal = events
        .filter(
          (ev) =>
            ev.start > now &&
            ev.start.toDateString() === todayStr &&
            ev.technicians.some((t) => t.id === techId)
        )
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      const upcomingExternal = busySlots
        .filter(
          (s) =>
            s.technicianId === techId &&
            s.start > now &&
            s.start.toDateString() === todayStr
        )
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      const nextInternal = upcomingInternal[0];
      const nextExternal = upcomingExternal[0];

      let nextStart: Date | null = null;
      if (nextInternal && nextExternal) {
        nextStart = nextInternal.start < nextExternal.start ? nextInternal.start : nextExternal.start;
      } else if (nextInternal) {
        nextStart = nextInternal.start;
      } else if (nextExternal) {
        nextStart = nextExternal.start;
      }

      if (nextStart) {
        map.set(techId, {
          state: "free-until",
          label: `Ledig til ${format(nextStart, "HH:mm")}`,
          until: nextStart,
        });
      } else {
        map.set(techId, {
          state: "free",
          label: "Ledig nå",
        });
      }
    }

    return map;
  }, [events, busySlots, technicianIds]);
}
