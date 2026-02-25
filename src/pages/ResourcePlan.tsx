import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { WeekCalendar } from "@/components/WeekCalendar";
import { TechnicianList } from "@/components/TechnicianList";
import { StatusLegend } from "@/components/StatusLegend";
import { ResourceAssignDialog } from "@/components/ResourceAssignDialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Plus, CalendarDays } from "lucide-react";
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

  const handleJobClick = (job: CalendarEvent) => {
    navigate(`/projects/${job.id}`);
  };

  const handleDayClick = (date: Date) => {
    if (!isAdmin) return;
    setClickedDate(date);
    setAssignOpen(true);
  };

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
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
              <CalendarDays className="h-6 w-6 text-primary" />
              Ressursplan
            </h1>
            <p className="text-sm text-muted-foreground/70">
              Uke {format(new Date(), "w", { locale: nb })} ·{" "}
              {format(new Date(), "MMMM yyyy", { locale: nb })}
            </p>
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
              <Button onClick={() => { setClickedDate(null); setAssignOpen(true); }} size="sm" className="gap-1.5 rounded-xl">
                <Plus className="h-4 w-4" />
                Tildel ressurs
              </Button>
            )}
          </div>
        </div>

        <WeekCalendar
          technicianId={selectedTechId}
          onJobClick={handleJobClick}
          onDayClick={isAdmin ? handleDayClick : undefined}
          getBusySlotsForDay={getBusySlotsForDay}
          getExternalBusyMinutesForDay={getExternalBusyMinutesForDay}
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
