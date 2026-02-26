import { useState, useCallback, useMemo, useEffect } from "react";
import { addWeeks, addDays, startOfWeek, startOfMonth, addMonths, format, isSameWeek } from "date-fns";
import { nb } from "date-fns/locale";
import { TechnicianList } from "@/components/TechnicianList";
import { StatusLegend } from "@/components/StatusLegend";
import { ResourceCalendar } from "@/components/ResourceCalendar";
import { EventDrawer } from "@/components/EventDrawer";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, CalendarDays, ChevronLeft, ChevronRight, RotateCcw, UserCheck, UserMinus, Clock,
  Calendar, List,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useTechnicians } from "@/hooks/useTechnicians";
import { useExternalBusy } from "@/hooks/useExternalBusy";
import { useCalendarEvents, type CalendarEvent } from "@/hooks/useCalendarEvents";
import { useCapacity } from "@/hooks/useCapacity";
import { useTechnicianNowStatus, getContiguousFreeMinutes } from "@/hooks/useTechnicianNowStatus";
import { useCalendarSync } from "@/hooks/useCalendarSync";
import { OutlookConflictDialog } from "@/components/OutlookConflictDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type CalendarViewType = "timeGridDay" | "timeGridWeek" | "dayGridMonth" | "listWeek";

const VIEW_STORAGE_KEY = "resourcePlanView";
const VIEW_OPTIONS: { value: CalendarViewType; label: string; icon: typeof Calendar }[] = [
  { value: "timeGridDay", label: "Dag", icon: Calendar },
  { value: "timeGridWeek", label: "Uke", icon: CalendarDays },
  { value: "dayGridMonth", label: "Måned", icon: Calendar },
  { value: "listWeek", label: "Liste", icon: List },
];

function getStoredView(): CalendarViewType {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored && VIEW_OPTIONS.some((v) => v.value === stored)) return stored as CalendarViewType;
  } catch {}
  return "timeGridWeek";
}

export default function ResourcePlan() {
  const isMobile = useIsMobile();
  const { isAdmin } = useAuth();
  const { technicians } = useTechnicians();
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [capacityFilter, setCapacityFilter] = useState<"all" | "available" | "partial">("all");
  const [externalBlocksCapacity, setExternalBlocksCapacity] = useState(true);
  const [minFreeMinutes, setMinFreeMinutes] = useState<number | null>(null);
  const [calendarView, setCalendarView] = useState<CalendarViewType>(getStoredView);
  const { busySlots, getBusySlotsForDay, getExternalBusyMinutesForDay } = useExternalBusy(selectedTechId);
  const { syncUpdate, syncCreate, forceUpdate, acceptGraphVersion, conflict, dismissConflict } = useCalendarSync();

  // Persist view choice
  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, calendarView);
  }, [calendarView]);

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

  const selectedTech = selectedTechId ? technicians.find((t) => t.id === selectedTechId) : null;

  const technicianMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null }>();
    for (const t of technicians) map.set(t.id, { name: t.name, color: t.color || null });
    return map;
  }, [technicians]);

  const techIds = useMemo(
    () => selectedTechId ? [selectedTechId] : technicians.map((t) => t.id),
    [selectedTechId, technicians]
  );
  const { events: calEvents } = useCalendarEvents(selectedTechId, referenceDate);

  // Navigation helpers – view-aware
  const goToPrev = useCallback(() => {
    setReferenceDate((d) => {
      if (calendarView === "timeGridDay") return addDays(d, -1);
      if (calendarView === "dayGridMonth") return addMonths(d, -1);
      return addWeeks(d, -1);
    });
  }, [calendarView]);
  const goToNext = useCallback(() => {
    setReferenceDate((d) => {
      if (calendarView === "timeGridDay") return addDays(d, 1);
      if (calendarView === "dayGridMonth") return addMonths(d, 1);
      return addWeeks(d, 1);
    });
  }, [calendarView]);
  const goToToday = useCallback(() => setReferenceDate(new Date()), []);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setEditEvent(event);
    setPreselectedStart(null);
    setPreselectedEnd(null);
    setDrawerOpen(true);
  }, []);

  const handleDateSelect = useCallback((start: Date, end: Date) => {
    if (!isAdmin) return;
    setEditEvent(null);
    setPreselectedStart(start);
    setPreselectedEnd(end);
    setDrawerOpen(true);
  }, [isAdmin]);

  const handleNewEvent = useCallback(() => {
    setEditEvent(null);
    setPreselectedStart(null);
    setPreselectedEnd(null);
    setDrawerOpen(true);
  }, []);

  const handleEventDrop = useCallback(async (eventId: string, newStart: Date, newEnd: Date) => {
    const oldEvent = calEvents.find((e) => e.id === eventId);
    const { error } = await supabase.from("events")
      .update({ start_time: newStart.toISOString(), end_time: newEnd.toISOString() })
      .eq("id", eventId);
    if (error) toast.error("Kunne ikke flytte hendelsen");
    else {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      await supabase.from("event_logs").insert({
        event_id: eventId,
        action_type: "time_changed",
        performed_by: userId || null,
        change_summary: `Flyttet fra ${oldEvent ? format(oldEvent.start, "dd.MM HH:mm") + "–" + format(oldEvent.end, "HH:mm") : "ukjent"} til ${format(newStart, "dd.MM HH:mm")}–${format(newEnd, "HH:mm")}`,
      });
      const result = await syncUpdate(eventId);
      if (result === "synced") {
        toast.success("Tidspunkt oppdatert. Outlook synkronisert ✓");
      } else if (result !== "conflict") {
        toast.success("Hendelse flyttet");
      }
    }
    setRefreshKey((k) => k + 1);
  }, [syncUpdate, calEvents]);

  const handleEventResize = useCallback(async (eventId: string, newStart: Date, newEnd: Date) => {
    const oldEvent = calEvents.find((e) => e.id === eventId);
    const { error } = await supabase.from("events")
      .update({ start_time: newStart.toISOString(), end_time: newEnd.toISOString() })
      .eq("id", eventId);
    if (error) toast.error("Kunne ikke endre varighet");
    else {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      await supabase.from("event_logs").insert({
        event_id: eventId,
        action_type: "duration_changed",
        performed_by: userId || null,
        change_summary: `Varighet endret fra ${oldEvent ? format(oldEvent.start, "HH:mm") + "–" + format(oldEvent.end, "HH:mm") : "ukjent"} til ${format(newStart, "HH:mm")}–${format(newEnd, "HH:mm")}`,
      });
      const result = await syncUpdate(eventId);
      if (result === "synced") {
        toast.success("Varighet oppdatert. Outlook synkronisert ✓");
      } else if (result !== "conflict") {
        toast.success("Varighet oppdatert");
      }
    }
    setRefreshKey((k) => k + 1);
  }, [syncUpdate, calEvents]);
  const { aggregatedDays, techCapacities, availableTechIds, partialTechIds } = useCapacity(
    calEvents, busySlots, referenceDate, techIds
  );

  const nowStatusMap = useTechnicianNowStatus(calEvents, busySlots, techIds, externalBlocksCapacity);

  const todayDayIndex = useMemo(() => {
    const today = new Date();
    const ws = startOfWeek(referenceDate, { weekStartsOn: 1 });
    const diff = Math.floor((today.getTime() - ws.getTime()) / 86400000);
    return diff >= 0 && diff < 7 ? diff : 0;
  }, [referenceDate]);

  // Filter technicians: capacity + min free minutes
  const filteredTechForSidebar = useMemo(() => {
    let ids: string[] | null = null;

    if (capacityFilter === "available") {
      ids = availableTechIds(todayDayIndex);
    } else if (capacityFilter === "partial") {
      ids = partialTechIds(todayDayIndex);
    }

    // Apply "min free minutes" filter
    if (minFreeMinutes) {
      const candidateIds = ids || techIds;
      ids = candidateIds.filter((techId) => {
        const free = getContiguousFreeMinutes(techId, calEvents, busySlots, externalBlocksCapacity);
        return free >= minFreeMinutes;
      });
    }

    if (ids === null && capacityFilter === "all") return null;
    return new Set(ids || []);
  }, [capacityFilter, availableTechIds, partialTechIds, todayDayIndex, minFreeMinutes, techIds, calEvents, busySlots, externalBlocksCapacity]);

  return (
    <div className="flex flex-1 overflow-hidden h-full">
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
              <Button variant={capacityFilter === "all" ? "default" : "ghost"} size="sm" className="h-7 text-xs rounded-md px-2.5" onClick={() => setCapacityFilter("all")}>Alle</Button>
              <Button variant={capacityFilter === "available" ? "default" : "ghost"} size="sm" className="h-7 text-xs rounded-md px-2.5 gap-1" onClick={() => setCapacityFilter("available")}>
                <UserCheck className="h-3 w-3" />Ledige
              </Button>
              <Button variant={capacityFilter === "partial" ? "default" : "ghost"} size="sm" className="h-7 text-xs rounded-md px-2.5 gap-1" onClick={() => setCapacityFilter("partial")}>
                <UserMinus className="h-3 w-3" />Delvis
              </Button>
            </div>

            {/* Min free minutes filter */}
            <Select value={minFreeMinutes?.toString() || "none"} onValueChange={(v) => setMinFreeMinutes(v === "none" ? null : Number(v))}>
              <SelectTrigger className="w-[140px] h-7 text-xs rounded-lg border-border/40">
                <Clock className="h-3 w-3 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Min. ledig" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Alle (ingen min.)</SelectItem>
                <SelectItem value="30">Ledig 30+ min</SelectItem>
                <SelectItem value="60">Ledig 60+ min</SelectItem>
                <SelectItem value="90">Ledig 90+ min</SelectItem>
                <SelectItem value="120">Ledig 120+ min</SelectItem>
              </SelectContent>
            </Select>

            {/* External blocks capacity toggle */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch checked={externalBlocksCapacity} onCheckedChange={setExternalBlocksCapacity} className="scale-75" />
              <span className="whitespace-nowrap">Ekstern blokkerer</span>
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

        {/* View switcher + navigation */}
        <div className="flex items-center justify-between mb-4 bg-card/80 backdrop-blur-sm border border-border/30 rounded-xl px-4 py-2.5">
          <Button variant="ghost" size="icon" onClick={goToPrev} className="h-8 w-8 rounded-lg">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-4">
            {/* View switcher */}
            <div className="flex items-center gap-0.5 border border-border/40 rounded-lg p-0.5">
              {VIEW_OPTIONS.map((v) => (
                <Button
                  key={v.value}
                  variant={calendarView === v.value ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs rounded-md px-2.5"
                  onClick={() => setCalendarView(v.value)}
                >
                  {v.label}
                </Button>
              ))}
            </div>

            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">
                {calendarView === "dayGridMonth"
                  ? format(referenceDate, "MMMM yyyy", { locale: nb })
                  : calendarView === "timeGridDay"
                  ? format(referenceDate, "EEEE d. MMMM", { locale: nb })
                  : `Uke ${format(weekStart, "w", { locale: nb })}`}
              </p>
              {(calendarView === "timeGridWeek" || calendarView === "listWeek") && (
                <p className="text-xs text-muted-foreground">
                  {format(weekStart, "d. MMM", { locale: nb })} – {format(addWeeks(weekStart, 1), "d. MMM yyyy", { locale: nb })}
                </p>
              )}
            </div>
            {!isCurrentWeek && (
              <Button variant="outline" size="sm" onClick={goToToday} className="gap-1.5 rounded-lg text-xs h-7">
                <RotateCcw className="h-3 w-3" />
                I dag
              </Button>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={goToNext} className="h-8 w-8 rounded-lg">
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
          calendarView={calendarView}
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

      <EventDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        editEvent={editEvent}
        preselectedStart={preselectedStart}
        preselectedEnd={preselectedEnd}
        preselectedTechId={selectedTechId}
        onSaved={(eventId) => {
          setRefreshKey((k) => k + 1);
          if (eventId) {
            if (editEvent) syncUpdate(eventId);
            else syncCreate(eventId);
          }
        }}
      />

      <OutlookConflictDialog
        conflict={conflict}
        onUseSystem={() => conflict && forceUpdate(conflict.eventId)}
        onUseOutlook={() => {
          if (conflict?.graphVersion) {
            acceptGraphVersion(conflict.eventId, conflict.graphVersion.start, conflict.graphVersion.end);
            setRefreshKey((k) => k + 1);
          }
        }}
        onDismiss={dismissConflict}
      />
    </div>
  );
}
