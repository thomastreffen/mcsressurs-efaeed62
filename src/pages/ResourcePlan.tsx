import { useState, useCallback, useMemo } from "react";
import { addWeeks, startOfWeek, format, isSameWeek } from "date-fns";
import { nb } from "date-fns/locale";
import { TechnicianList } from "@/components/TechnicianList";
import { StatusLegend } from "@/components/StatusLegend";
import { ResourceCalendar } from "@/components/ResourceCalendar";
import { EventDrawer } from "@/components/EventDrawer";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, CalendarDays, ChevronLeft, ChevronRight, RotateCcw, UserCheck, UserMinus,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useTechnicians } from "@/hooks/useTechnicians";
import { useExternalBusy } from "@/hooks/useExternalBusy";
import { useCalendarEvents, type CalendarEvent } from "@/hooks/useCalendarEvents";
import { useCapacity } from "@/hooks/useCapacity";
import { useTechnicianNowStatus } from "@/hooks/useTechnicianNowStatus";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ResourcePlan() {
  const isMobile = useIsMobile();
  const { isAdmin } = useAuth();
  const { technicians } = useTechnicians();
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [capacityFilter, setCapacityFilter] = useState<"all" | "available" | "partial">("all");
  const { busySlots, getBusySlotsForDay, getExternalBusyMinutesForDay } = useExternalBusy(selectedTechId);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [preselectedStart, setPreselectedStart] = useState<Date | null>(null);
  const [preselectedEnd, setPreselectedEnd] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Week navigation
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const isCurrentWeek = isSameWeek(referenceDate, new Date(), { weekStartsOn: 1 });
  const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });

  const goToPrevWeek = useCallback(() => setReferenceDate((d) => addWeeks(d, -1)), []);
  const goToNextWeek = useCallback(() => setReferenceDate((d) => addWeeks(d, 1)), []);
  const goToToday = useCallback(() => setReferenceDate(new Date()), []);

  // Open drawer for editing
  const handleEventClick = useCallback((event: CalendarEvent) => {
    setEditEvent(event);
    setPreselectedStart(null);
    setPreselectedEnd(null);
    setDrawerOpen(true);
  }, []);

  // Open drawer for new event from date selection
  const handleDateSelect = useCallback((start: Date, end: Date) => {
    if (!isAdmin) return;
    setEditEvent(null);
    setPreselectedStart(start);
    setPreselectedEnd(end);
    setDrawerOpen(true);
  }, [isAdmin]);

  // Open drawer for new event from button
  const handleNewEvent = useCallback(() => {
    setEditEvent(null);
    setPreselectedStart(null);
    setPreselectedEnd(null);
    setDrawerOpen(true);
  }, []);

  // Handle drag/drop and resize directly updating DB
  const handleEventDrop = useCallback(async (eventId: string, newStart: Date, newEnd: Date) => {
    const { error } = await supabase.from("events")
      .update({ start_time: newStart.toISOString(), end_time: newEnd.toISOString() })
      .eq("id", eventId);
    if (error) {
      toast.error("Kunne ikke flytte hendelsen");
    } else {
      toast.success("Hendelse flyttet");
    }
    setRefreshKey((k) => k + 1);
  }, []);

  const handleEventResize = useCallback(async (eventId: string, newStart: Date, newEnd: Date) => {
    const { error } = await supabase.from("events")
      .update({ start_time: newStart.toISOString(), end_time: newEnd.toISOString() })
      .eq("id", eventId);
    if (error) {
      toast.error("Kunne ikke endre varighet");
    } else {
      toast.success("Varighet oppdatert");
    }
    setRefreshKey((k) => k + 1);
  }, []);

  // Selected technician info
  const selectedTech = selectedTechId ? technicians.find((t) => t.id === selectedTechId) : null;

  // Technician map for calendar
  const technicianMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null }>();
    for (const t of technicians) {
      map.set(t.id, { name: t.name, color: t.color || null });
    }
    return map;
  }, [technicians]);

  // Capacity calculation
  const techIds = useMemo(
    () => selectedTechId ? [selectedTechId] : technicians.map((t) => t.id),
    [selectedTechId, technicians]
  );
  const { events: calEvents } = useCalendarEvents(selectedTechId, referenceDate);
  const { aggregatedDays, techCapacities, availableTechIds, partialTechIds } = useCapacity(
    calEvents,
    busySlots,
    referenceDate,
    techIds
  );

  // Real-time now status for sidebar
  const nowStatusMap = useTechnicianNowStatus(calEvents, busySlots, techIds);

  // Today's day index (0=Mon)
  const todayDayIndex = useMemo(() => {
    const today = new Date();
    const ws = startOfWeek(referenceDate, { weekStartsOn: 1 });
    const diff = Math.floor((today.getTime() - ws.getTime()) / 86400000);
    return diff >= 0 && diff < 7 ? diff : 0;
  }, [referenceDate]);

  // Filter technicians in sidebar based on capacity filter
  const filteredTechForSidebar = useMemo(() => {
    if (capacityFilter === "all") return null; // no override
    const ids = capacityFilter === "available"
      ? availableTechIds(todayDayIndex)
      : partialTechIds(todayDayIndex);
    return new Set(ids);
  }, [capacityFilter, availableTechIds, partialTechIds, todayDayIndex]);

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Desktop: Technician sidebar */}
      {!isMobile && (
        <aside className="w-56 shrink-0 border-r border-border/30 bg-card/50 overflow-y-auto p-3">
          <TechnicianList
            selectedId={selectedTechId}
            onSelect={setSelectedTechId}
            allowDeselect
            filterIds={filteredTechForSidebar}
            nowStatusMap={nowStatusMap}
          />
        </aside>
      )}

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2.5">
              <CalendarDays className="h-6 w-6 text-primary" />
              Ressursplan
              {selectedTech && (
                <span
                  className="inline-flex items-center gap-1.5 text-base font-semibold px-3 py-1 rounded-full"
                  style={{
                    backgroundColor: `${selectedTech.color || "#6366f1"}15`,
                    color: selectedTech.color || "#6366f1",
                  }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedTech.color || "#6366f1" }} />
                  {selectedTech.name}
                </span>
              )}
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isMobile && (
              <Select value={selectedTechId || "all"} onValueChange={(v) => setSelectedTechId(v === "all" ? null : v)}>
                <SelectTrigger className="w-[160px] rounded-xl">
                  <SelectValue placeholder="Alle montører" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle montører</SelectItem>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color || "#6366f1" }} />
                        {t.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Quick capacity filters */}
            <div className="flex items-center gap-1 border border-border/40 rounded-lg p-0.5">
              <Button
                variant={capacityFilter === "all" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs rounded-md px-2.5"
                onClick={() => setCapacityFilter("all")}
              >
                Alle
              </Button>
              <Button
                variant={capacityFilter === "available" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs rounded-md px-2.5 gap-1"
                onClick={() => setCapacityFilter("available")}
              >
                <UserCheck className="h-3 w-3" />
                Ledige
              </Button>
              <Button
                variant={capacityFilter === "partial" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs rounded-md px-2.5 gap-1"
                onClick={() => setCapacityFilter("partial")}
              >
                <UserMinus className="h-3 w-3" />
                Delvis
              </Button>
            </div>

            <StatusLegend />

            {isAdmin && (
              <Button onClick={handleNewEvent} size="sm" className="gap-1.5 rounded-xl">
                <Plus className="h-4 w-4" />
                Ny hendelse
              </Button>
            )}
          </div>
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between mb-4 bg-card/80 backdrop-blur-sm border border-border/30 rounded-xl px-4 py-2.5">
          <Button variant="ghost" size="icon" onClick={goToPrevWeek} className="h-8 w-8 rounded-lg">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">
                Uke {format(weekStart, "w", { locale: nb })}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(weekStart, "d. MMM", { locale: nb })} – {format(addWeeks(weekStart, 1), "d. MMM yyyy", { locale: nb })}
              </p>
            </div>
            {!isCurrentWeek && (
              <Button variant="outline" size="sm" onClick={goToToday} className="gap-1.5 rounded-lg text-xs h-7">
                <RotateCcw className="h-3 w-3" />
                I dag
              </Button>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={goToNextWeek} className="h-8 w-8 rounded-lg">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Interactive FullCalendar */}
        <ResourceCalendar
          key={refreshKey}
          technicianId={capacityFilter !== "all" && filteredTechForSidebar
            ? (filteredTechForSidebar.size === 1 ? Array.from(filteredTechForSidebar)[0] : selectedTechId)
            : selectedTechId}
          referenceDate={referenceDate}
          technicianMap={technicianMap}
          getBusySlotsForDay={getBusySlotsForDay}
          dayCapacities={aggregatedDays}
          onEventClick={handleEventClick}
          onDateSelect={handleDateSelect}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          isAdmin={isAdmin}
        />
      </div>

      {/* Event Drawer (replaces both ResourceAssignDialog and JobQuickEditSheet) */}
      <EventDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        editEvent={editEvent}
        preselectedStart={preselectedStart}
        preselectedEnd={preselectedEnd}
        preselectedTechId={selectedTechId}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
