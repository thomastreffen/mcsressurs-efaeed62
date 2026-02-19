import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek, differenceInMinutes } from "date-fns";
import type { JobStatus } from "@/lib/job-status";
import type { Job } from "@/lib/mock-data";

export function useCalendarEvents(technicianId: string | null) {
  const [events, setEvents] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const weekEnd = useMemo(() => endOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const weekStartISO = weekStart.toISOString();
  const weekEndISO = weekEnd.toISOString();

  const fetchEvents = useCallback(async () => {
    if (!technicianId) {
      setEvents([]);
      return;
    }

    setLoading(true);
    try {
      // Single join query – events is root, event_technicians is join only
      const { data, error } = await supabase
        .from("events")
        .select(`
          id,
          title,
          description,
          customer,
          address,
          start_time,
          end_time,
          status,
          job_number,
          internal_number,
          microsoft_event_id,
          proposed_start,
          proposed_end,
          created_at,
          updated_at,
          event_technicians (
            technician_id
          )
        `)
        .gte("start_time", weekStartISO)
        .lte("start_time", weekEndISO)
        .order("start_time", { ascending: true });

      if (error) {
        console.error("[Calendar] Failed to fetch events:", error);
        setEvents([]);
        setLoading(false);
        return;
      }

      // Filter to only events where this technician is assigned
      const filtered = (data ?? []).filter((e) =>
        e.event_technicians?.some((et: { technician_id: string }) => et.technician_id === technicianId)
      );

      // Deduplicate by event.id (safety net)
      const uniqueMap = new Map<string, (typeof filtered)[0]>();
      for (const e of filtered) {
        uniqueMap.set(e.id, e);
      }

      const mapped: Job[] = Array.from(uniqueMap.values()).map((e) => ({
        id: e.id,
        microsoftEventId: e.microsoft_event_id ?? "",
        technicianIds: (e.event_technicians ?? []).map((et: { technician_id: string }) => et.technician_id),
        attendeeStatuses: [],
        title: e.title,
        customer: e.customer ?? "",
        address: e.address ?? "",
        description: e.description ?? "",
        start: new Date(e.start_time),
        end: new Date(e.end_time),
        status: e.status as JobStatus,
        jobNumber: e.job_number,
        internalNumber: e.internal_number,
        proposedStart: e.proposed_start ? new Date(e.proposed_start) : undefined,
        proposedEnd: e.proposed_end ? new Date(e.proposed_end) : undefined,
        createdAt: e.created_at ? new Date(e.created_at) : undefined,
        updatedAt: e.updated_at ? new Date(e.updated_at) : undefined,
      }));

      console.log(`[Calendar] Fetched ${mapped.length} unique events for technician ${technicianId}`);
      setEvents(mapped);
    } catch (err) {
      console.error("[Calendar] Fetch exception:", err);
    } finally {
      setLoading(false);
    }
  }, [technicianId, weekStartISO, weekEndISO]);

  // Initial fetch
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Realtime – only on events table
  useEffect(() => {
    const channel = supabase
      .channel("calendar-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => {
          console.log("[Calendar] Realtime update triggered (events)");
          fetchEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEvents]);

  const getJobsForDay = useCallback(
    (date: Date): Job[] =>
      events.filter((j) => j.start.toDateString() === date.toDateString()),
    [events]
  );

  const getBookedMinutesForDay = useCallback(
    (date: Date): number =>
      getJobsForDay(date).reduce(
        (sum, job) => sum + differenceInMinutes(job.end, job.start),
        0
      ),
    [getJobsForDay]
  );

  return { events, loading, refetch: fetchEvents, getJobsForDay, getBookedMinutesForDay };
}
