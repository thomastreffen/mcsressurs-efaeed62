import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek, differenceInMinutes } from "date-fns";
import type { JobStatus } from "@/lib/job-status";
import type { Job } from "@/lib/mock-data";

export interface TechnicianInfo {
  id: string;
  name: string;
  color: string | null;
}

export interface CalendarEvent extends Job {
  technicians: TechnicianInfo[];
}

export function useCalendarEvents(technicianId: string | null, referenceDate?: Date) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const refDate = referenceDate ?? new Date();
  const weekStart = useMemo(() => startOfWeek(refDate, { weekStartsOn: 1 }), [refDate.toDateString()]);
  const weekEnd = useMemo(() => endOfWeek(refDate, { weekStartsOn: 1 }), [refDate.toDateString()]);
  const weekStartISO = weekStart.toISOString();
  const weekEndISO = weekEnd.toISOString();

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
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
          attachments,
          event_technicians (
            technician_id,
            technicians (
              id,
              name,
              color
            )
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

      const allEvents = data ?? [];

      const filtered = technicianId
        ? allEvents.filter((e: any) =>
            e.event_technicians?.some((et: any) => et.technician_id === technicianId)
          )
        : allEvents;

      const uniqueMap = new Map<string, (typeof filtered)[0]>();
      for (const e of filtered) {
        uniqueMap.set(e.id, e);
      }

      const mapped: CalendarEvent[] = Array.from(uniqueMap.values()).map((e: any) => {
        const technicians: TechnicianInfo[] = (e.event_technicians ?? [])
          .filter((et: any) => et.technicians)
          .map((et: any) => ({
            id: et.technicians.id,
            name: et.technicians.name,
            color: et.technicians.color,
          }));

        return {
          id: e.id,
          microsoftEventId: e.microsoft_event_id ?? "",
          technicianIds: (e.event_technicians ?? []).map((et: any) => et.technician_id),
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
          attachments: e.attachments ?? [],
          technicians,
        };
      });

      console.log(`[Calendar] Fetched ${mapped.length} unique events (tech: ${technicianId ?? "ALL"}, week: ${weekStartISO.slice(0, 10)})`);
      setEvents(mapped);
    } catch (err) {
      console.error("[Calendar] Fetch exception:", err);
    } finally {
      setLoading(false);
    }
  }, [technicianId, weekStartISO, weekEndISO]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    const channel = supabase
      .channel("calendar-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => {
          console.log("[Calendar] Realtime update triggered");
          fetchEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEvents]);

  const getJobsForDay = useCallback(
    (date: Date): CalendarEvent[] =>
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
