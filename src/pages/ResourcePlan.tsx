import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { addWeeks, startOfWeek, format, isSameWeek } from "date-fns";
import { nb } from "date-fns/locale";
import { WeekCalendar } from "@/components/WeekCalendar";
import { TechnicianList } from "@/components/TechnicianList";
import { StatusLegend } from "@/components/StatusLegend";
import { ResourceAssignDialog } from "@/components/ResourceAssignDialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, CalendarDays, ChevronLeft, ChevronRight, RotateCcw,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useTechnicians } from "@/hooks/useTechnicians";
import { useExternalBusy } from "@/hooks/useExternalBusy";
import type { CalendarEvent } from "@/hooks/useCalendarEvents";

export default function ResourcePlan() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { isAdmin } = useAuth();
  const { technicians } = useTechnicians();
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const { getBusySlotsForDay, getExternalBusyMinutesForDay } = useExternalBusy(selectedTechId);
  const [assignOpen, setAssignOpen] = useState(false);
  const [clickedDate, setClickedDate] = useState<Date | null>(null);

  // Week navigation
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const isCurrentWeek = isSameWeek(referenceDate, new Date(), { weekStartsOn: 1 });
  const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });

  const goToPrevWeek = useCallback(() => setReferenceDate((d) => addWeeks(d, -1)), []);
  const goToNextWeek = useCallback(() => setReferenceDate((d) => addWeeks(d, 1)), []);
  const goToToday = useCallback(() => setReferenceDate(new Date()), []);

  const handleJobClick = (job: CalendarEvent) => {
    navigate(`/projects/${job.id}`);
  };

  const handleDayClick = (date: Date) => {
    if (!isAdmin) return;
    setClickedDate(date);
    setAssignOpen(true);
  };

  // Selected technician info for header
  const selectedTech = selectedTechId
    ? technicians.find((t) => t.id === selectedTechId)
    : null;

  // Build a map for technician color/name lookup
  const technicianMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null }>();
    for (const t of technicians) {
      map.set(t.id, { name: t.name, color: t.color || null });
    }
    return map;
  }, [technicians]);

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Desktop: Technician sidebar */}
      {!isMobile && (
        <aside className="w-56 shrink-0 border-r border-border/30 bg-card/50 overflow-y-auto p-3">
          <TechnicianList
            selectedId={selectedTechId}
            onSelect={setSelectedTechId}
            allowDeselect
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
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: selectedTech.color || "#6366f1" }}
                  />
                  {selectedTech.name}
                </span>
              )}
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Mobile tech filter */}
            {isMobile && (
              <Select
                value={selectedTechId || "all"}
                onValueChange={(v) => setSelectedTechId(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-[160px] rounded-xl">
                  <SelectValue placeholder="Alle montører" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle montører</SelectItem>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: t.color || "#6366f1" }}
                        />
                        {t.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <StatusLegend />

            {isAdmin && (
              <Button
                onClick={() => { setClickedDate(null); setAssignOpen(true); }}
                size="sm"
                className="gap-1.5 rounded-xl"
              >
                <Plus className="h-4 w-4" />
                Tildel ressurs
              </Button>
            )}
          </div>
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between mb-4 bg-card/80 backdrop-blur-sm border border-border/30 rounded-xl px-4 py-2.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPrevWeek}
            className="h-8 w-8 rounded-lg"
          >
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
              <Button
                variant="outline"
                size="sm"
                onClick={goToToday}
                className="gap-1.5 rounded-lg text-xs h-7"
              >
                <RotateCcw className="h-3 w-3" />
                I dag
              </Button>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={goToNextWeek}
            className="h-8 w-8 rounded-lg"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <WeekCalendar
          technicianId={selectedTechId}
          referenceDate={referenceDate}
          onJobClick={handleJobClick}
          onDayClick={isAdmin ? handleDayClick : undefined}
          getBusySlotsForDay={getBusySlotsForDay}
          getExternalBusyMinutesForDay={getExternalBusyMinutesForDay}
          technicianMap={technicianMap}
        />
      </div>

      <ResourceAssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        preselectedDate={clickedDate}
        preselectedTechId={selectedTechId}
      />
    </div>
  );
}
