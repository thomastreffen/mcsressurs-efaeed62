import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek, addDays, differenceInMinutes } from "date-fns";
import type { JobStatus } from "@/lib/job-status";
import type { Job } from "@/lib/mock-data";

export function useCalendarEvents(technicianId: string | null) {
  const [events, setEvents] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const fetchEvents = useCallback(async () => {
    if (!technicianId) {
      setEvents([]);
      return;
    }

    setLoading(true);
    try {
      // Get event IDs for this technician
      const { data: assignments, error: assignErr } = await supabase
        .from("event_technicians")
        .select("event_id")
        .eq("technician_id", technicianId);

      if (assignErr) {
        console.error("[Calendar] Failed to fetch assignments:", assignErr);
        setEvents([]);
        setLoading(false);
        return;
      }

      const eventIds = assignments?.map((a) => a.event_id) ?? [];
      if (eventIds.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }

      // Fetch events within this week
      const { data: dbEvents, error: evErr } = await supabase
        .from("events")
        .select("*")
        .in("id", eventIds)
        .gte("start_time", weekStart.toISOString())
        .lte("start_time", weekEnd.toISOString())
        .order("start_time", { ascending: true });

      if (evErr) {
        console.error("[Calendar] Failed to fetch events:", evErr);
        setEvents([]);
        setLoading(false);
        return;
      }

      // Also fetch all technician assignments for these events (for technicianIds field)
      const fetchedIds = (dbEvents ?? []).map((e) => e.id);
      let allAssignments: { event_id: string; technician_id: string }[] = [];
      if (fetchedIds.length > 0) {
        const { data: aData } = await supabase
          .from("event_technicians")
          .select("event_id, technician_id")
          .in("event_id", fetchedIds);
        allAssignments = aData ?? [];
      }

      const mapped: Job[] = (dbEvents ?? []).map((e) => ({
        id: e.id,
        microsoftEventId: e.microsoft_event_id ?? "",
        technicianIds: allAssignments
          .filter((a) => a.event_id === e.id)
          .map((a) => a.technician_id),
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

      setEvents(mapped);
    } catch (err) {
      console.error("[Calendar] Fetch exception:", err);
    } finally {
      setLoading(false);
    }
  }, [technicianId, weekStart.toISOString()]);

  // Initial fetch
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Realtime subscription
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_technicians" },
        () => {
          console.log("[Calendar] Realtime update triggered (event_technicians)");
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
