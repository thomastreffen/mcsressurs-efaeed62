import { useMemo } from "react";
import { startOfWeek, addDays, differenceInMinutes } from "date-fns";
import type { CalendarEvent } from "@/hooks/useCalendarEvents";
import type { ExternalBusySlot } from "@/hooks/useExternalBusy";

const WORK_DAY_MINUTES = 480; // 8h (08:00–16:00)

export interface DayCapacity {
  date: Date;
  bookedMinutes: number;
  externalMinutes: number;
  totalMinutes: number;
  percent: number;
  color: string;
  label: string;
}

export interface TechDayCapacity {
  techId: string;
  days: DayCapacity[];
  weekPercent: number;
}

function capacityColor(percent: number): string {
  if (percent > 100) return "#7F1D1D"; // dark red
  if (percent >= 90) return "#DC2626";  // red
  if (percent >= 50) return "#F59E0B";  // yellow/amber
  return "#22C55E"; // green
}

function capacityLabel(percent: number): string {
  if (percent > 100) return "Overbooket";
  if (percent >= 90) return "Full dag";
  if (percent >= 50) return `${Math.round(percent)}%`;
  if (percent > 0) return `${Math.round(percent)}%`;
  return "Ledig";
}

export function useCapacity(
  events: CalendarEvent[],
  busySlots: ExternalBusySlot[],
  referenceDate: Date,
  technicianIds: string[]
) {
  return useMemo(() => {
    const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });

    // Per-tech capacity
    const techCapacities: TechDayCapacity[] = technicianIds.map((techId) => {
      const days: DayCapacity[] = [];
      let weekTotal = 0;

      for (let i = 0; i < 7; i++) {
        const day = addDays(weekStart, i);
        const dayStr = day.toDateString();

        // Internal events for this tech on this day
        const bookedMinutes = events
          .filter(
            (ev) =>
              ev.start.toDateString() === dayStr &&
              ev.technicians.some((t) => t.id === techId)
          )
          .reduce((sum, ev) => sum + differenceInMinutes(ev.end, ev.start), 0);

        // External busy for this tech on this day
        const externalMinutes = busySlots
          .filter(
            (s) => s.technicianId === techId && s.start.toDateString() === dayStr
          )
          .reduce(
            (sum, s) => sum + Math.round((s.end.getTime() - s.start.getTime()) / 60000),
            0
          );

        const totalMinutes = bookedMinutes + externalMinutes;
        // Weekend days: use same calculation but note capacity is still 8h for consistency
        const percent = (totalMinutes / WORK_DAY_MINUTES) * 100;

        days.push({
          date: day,
          bookedMinutes,
          externalMinutes,
          totalMinutes,
          percent,
          color: capacityColor(percent),
          label: capacityLabel(percent),
        });

        weekTotal += totalMinutes;
      }

      const weekPercent = (weekTotal / (5 * WORK_DAY_MINUTES)) * 100; // 5 work days

      return { techId, days, weekPercent };
    });

    // Aggregated day capacity (all techs or filtered)
    const aggregatedDays: DayCapacity[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      const dayStr = day.toDateString();

      let totalBooked = 0;
      let totalExternal = 0;

      for (const techCap of techCapacities) {
        const d = techCap.days[i];
        totalBooked += d.bookedMinutes;
        totalExternal += d.externalMinutes;
      }

      const totalMinutes = totalBooked + totalExternal;
      const totalCapacity = technicianIds.length * WORK_DAY_MINUTES;
      const percent = totalCapacity > 0 ? (totalMinutes / totalCapacity) * 100 : 0;

      aggregatedDays.push({
        date: day,
        bookedMinutes: totalBooked,
        externalMinutes: totalExternal,
        totalMinutes,
        percent,
        color: capacityColor(percent),
        label: capacityLabel(percent),
      });
    }

    // Filter helpers
    const availableTechIds = (dayIndex: number) =>
      techCapacities
        .filter((tc) => tc.days[dayIndex].percent < 50)
        .map((tc) => tc.techId);

    const partialTechIds = (dayIndex: number) =>
      techCapacities
        .filter((tc) => tc.days[dayIndex].percent >= 50 && tc.days[dayIndex].percent < 90)
        .map((tc) => tc.techId);

    return {
      techCapacities,
      aggregatedDays,
      availableTechIds,
      partialTechIds,
    };
  }, [events, busySlots, referenceDate, technicianIds]);
}
