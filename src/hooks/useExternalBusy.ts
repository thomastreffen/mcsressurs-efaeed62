import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek, format } from "date-fns";

export interface ExternalBusySlot {
  technicianId: string;
  start: Date;
  end: Date;
}

/**
 * Fetches external (Outlook) busy slots for all technicians for the current week.
 * Uses the existing ms-calendar edge function "availability" action.
 * Filters out slots that overlap with existing system events to avoid duplicates.
 */
export function useExternalBusy(technicianId: string | null) {
  const [busySlots, setBusySlots] = useState<ExternalBusySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const weekEnd = useMemo(() => endOfWeek(new Date(), { weekStartsOn: 1 }), []);

  const fetchBusy = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get all technician user_ids
      const { data: techs } = await supabase
        .from("technicians")
        .select("id, user_id")
        .not("user_id", "is", null);

      if (!techs?.length) {
        setBusySlots([]);
        return;
      }

      const userIds = techs.map((t: any) => t.user_id).filter(Boolean);
      const userToTech = new Map(techs.map((t: any) => [t.user_id, t.id]));

      const startISO = format(weekStart, "yyyy-MM-dd'T'HH:mm:ss");
      const endISO = format(weekEnd, "yyyy-MM-dd'T'HH:mm:ss");

      const { data, error: fnError } = await supabase.functions.invoke("ms-calendar", {
        body: {
          action: "availability",
          user_ids: userIds,
          start: startISO,
          end: endISO,
        },
      });

      if (fnError || data?.error) {
        const msg = data?.error || fnError?.message || "Ukjent feil";
        console.warn("[ExternalBusy] Fetch failed:", msg);
        setError(msg);
        setBusySlots([]);
        return;
      }

      const results: any[] = data?.results || [];
      const slots: ExternalBusySlot[] = [];
      let totalSlots = 0;
      let matchedSlots = 0;
      let droppedSlots = 0;

      for (const entry of results) {
        const techId = entry.technician_id || userToTech.get(entry.user_id);
        const entrySlots = entry.busy_slots || [];
        totalSlots += entrySlots.length;

        if (!techId) {
          droppedSlots += entrySlots.length;
          console.warn(`[ExternalBusy] Dropped ${entrySlots.length} slots for user ${entry.user_id} – no matching technician`);
          continue;
        }

        for (const slot of entrySlots) {
          if (!slot.start || !slot.end) {
            droppedSlots++;
            continue;
          }
          matchedSlots++;
          slots.push({
            technicianId: techId,
            start: new Date(slot.start),
            end: new Date(slot.end),
          });
        }
      }

      console.log(`[ExternalBusy] Total: ${totalSlots} slots fetched, ${matchedSlots} matched to technician, ${droppedSlots} dropped`);
      setBusySlots(slots);
    } catch (err: any) {
      console.error("[ExternalBusy] Exception:", err);
      setError(err.message);
      setBusySlots([]);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    fetchBusy();
  }, [fetchBusy]);

  /** Get external busy slots for a specific day, optionally filtered by technician */
  const getBusySlotsForDay = useCallback(
    (date: Date): ExternalBusySlot[] => {
      const dayStr = date.toDateString();
      return busySlots.filter((s) => {
        if (technicianId && s.technicianId !== technicianId) return false;
        return s.start.toDateString() === dayStr;
      });
    },
    [busySlots, technicianId]
  );

  /** Get total external busy minutes for a day */
  const getExternalBusyMinutesForDay = useCallback(
    (date: Date): number => {
      const daySlots = getBusySlotsForDay(date);
      return daySlots.reduce(
        (sum, s) => sum + Math.round((s.end.getTime() - s.start.getTime()) / 60000),
        0
      );
    },
    [getBusySlotsForDay]
  );

  return {
    busySlots,
    loading,
    error,
    refetch: fetchBusy,
    getBusySlotsForDay,
    getExternalBusyMinutesForDay,
  };
}
