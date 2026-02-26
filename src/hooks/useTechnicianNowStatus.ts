import { useMemo } from "react";
import type { CalendarEvent } from "@/hooks/useCalendarEvents";
import type { ExternalBusySlot } from "@/hooks/useExternalBusy";
import { format } from "date-fns";

export interface TechNowStatus {
  state: "busy" | "free" | "free-until";
  label: string;
  /** Human-readable duration string like "2t 10m" */
  durationLabel?: string;
  until?: Date;
  source?: "internal" | "external";
}

const WORK_START_HOUR = 7;
const WORK_END_HOUR = 15;
const BUFFER_MINUTES = 30;

function workStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(WORK_START_HOUR, 0, 0, 0);
  return d;
}

function workEnd(date: Date): Date {
  const d = new Date(date);
  d.setHours(WORK_END_HOUR, 0, 0, 0);
  return d;
}

function clampToWorkHours(time: Date, ref: Date): Date {
  const ws = workStart(ref);
  const we = workEnd(ref);
  if (time < ws) return ws;
  if (time > we) return we;
  return time;
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}t`;
  return `${h}t ${m}m`;
}

function addMinutes(date: Date, mins: number): Date {
  return new Date(date.getTime() + mins * 60000);
}

/**
 * Merge overlapping time intervals. Input: sorted by start.
 */
function mergeIntervals(intervals: { start: Date; end: Date }[]): { start: Date; end: Date }[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: { start: Date; end: Date }[] = [{ ...sorted[0] }];
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

/**
 * Build busy intervals for a technician, including buffer around internal events.
 */
function buildBusyIntervals(
  techId: string,
  now: Date,
  events: CalendarEvent[],
  busySlots: ExternalBusySlot[],
  externalBlocks: boolean
): { start: Date; end: Date }[] {
  const todayStr = now.toDateString();
  const we = workEnd(now);
  const intervals: { start: Date; end: Date }[] = [];

  // Internal events with buffer
  for (const ev of events) {
    if (ev.start.toDateString() !== todayStr && ev.end.toDateString() !== todayStr) continue;
    if (!ev.technicians.some((t) => t.id === techId)) continue;
    const start = addMinutes(ev.start, -BUFFER_MINUTES);
    const end = addMinutes(ev.end, BUFFER_MINUTES);
    intervals.push({
      start: start < now ? now : start,
      end: end > we ? we : end,
    });
  }

  // External busy slots
  if (externalBlocks) {
    for (const s of busySlots) {
      if (s.technicianId !== techId) continue;
      if (s.start.toDateString() !== todayStr && s.end.toDateString() !== todayStr) continue;
      intervals.push({
        start: s.start < now ? now : s.start,
        end: s.end > we ? we : s.end,
      });
    }
  }

  return mergeIntervals(intervals.filter((i) => i.end > now && i.start < we));
}

/**
 * Computes real-time availability status for each technician.
 * Considers work hours (07:00–15:00), buffer (30 min), and external events.
 */
export function useTechnicianNowStatus(
  events: CalendarEvent[],
  busySlots: ExternalBusySlot[],
  technicianIds: string[],
  externalBlocksCapacity: boolean = true
): Map<string, TechNowStatus> {
  return useMemo(() => {
    const now = new Date();
    const we = workEnd(now);
    const map = new Map<string, TechNowStatus>();

    // Outside work hours
    if (now >= we || now < workStart(now)) {
      for (const techId of technicianIds) {
        map.set(techId, { state: "free", label: "Utenfor arbeidstid" });
      }
      return map;
    }

    for (const techId of technicianIds) {
      const intervals = buildBusyIntervals(techId, now, events, busySlots, externalBlocksCapacity);

      // Check if currently in a busy interval
      const activeBusy = intervals.find((i) => i.start <= now && i.end > now);

      if (activeBusy) {
        const minsLeft = Math.round((activeBusy.end.getTime() - now.getTime()) / 60000);
        map.set(techId, {
          state: "busy",
          label: `Opptatt til ${format(activeBusy.end, "HH:mm")}`,
          durationLabel: `Opptatt i ${formatDuration(minsLeft)}`,
          until: activeBusy.end,
          source: "internal",
        });
        continue;
      }

      // Find next busy interval
      const nextBusy = intervals.find((i) => i.start > now);

      if (nextBusy) {
        const freeMinutes = Math.round((nextBusy.start.getTime() - now.getTime()) / 60000);
        map.set(techId, {
          state: "free-until",
          label: `Ledig til ${format(nextBusy.start, "HH:mm")}`,
          durationLabel: `Ledig i ${formatDuration(freeMinutes)}`,
          until: nextBusy.start,
        });
      } else {
        const freeMinutes = Math.round((we.getTime() - now.getTime()) / 60000);
        map.set(techId, {
          state: "free",
          label: "Ledig nå",
          durationLabel: `Ledig i ${formatDuration(freeMinutes)}`,
        });
      }
    }

    return map;
  }, [events, busySlots, technicianIds, externalBlocksCapacity]);
}

/**
 * Calculate contiguous free minutes from now for a technician.
 */
export function getContiguousFreeMinutes(
  techId: string,
  events: CalendarEvent[],
  busySlots: ExternalBusySlot[],
  externalBlocks: boolean
): number {
  const now = new Date();
  const we = workEnd(now);
  if (now >= we) return 0;

  const intervals = buildBusyIntervals(techId, now, events, busySlots, externalBlocks);
  const active = intervals.find((i) => i.start <= now && i.end > now);
  if (active) return 0;

  const next = intervals.find((i) => i.start > now);
  if (next) return Math.round((next.start.getTime() - now.getTime()) / 60000);
  return Math.round((we.getTime() - now.getTime()) / 60000);
}
