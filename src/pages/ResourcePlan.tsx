import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { WeekCalendar } from "@/components/WeekCalendar";
import { TechnicianList } from "@/components/TechnicianList";
import { StatusLegend } from "@/components/StatusLegend";
import { CreateJobDialog } from "@/components/CreateJobDialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Plus } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useTechnicians } from "@/hooks/useTechnicians";
import type { CalendarEvent } from "@/hooks/useCalendarEvents";

export default function ResourcePlan() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { isAdmin } = useAuth();
  const { technicians } = useTechnicians();
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const handleJobClick = (job: CalendarEvent) => {
    navigate(`/jobs/${job.id}`);
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Desktop: Technician sidebar */}
      {!isMobile && (
        <aside className="w-56 shrink-0 border-r bg-card overflow-y-auto p-3">
          <TechnicianList
            selectedId={selectedTechId}
            onSelect={setSelectedTechId}
            allowDeselect
          />
        </aside>
      )}

      <div className="flex-1 overflow-y-auto p-3 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Ressursplan</h1>
            <p className="text-sm text-muted-foreground">
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
                <SelectTrigger className="w-[160px]">
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
              <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Ny jobb
              </Button>
            )}
          </div>
        </div>

        <WeekCalendar technicianId={selectedTechId} onJobClick={handleJobClick} />
      </div>

      <CreateJobDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        preselectedTechId={selectedTechId}
      />
    </div>
  );
}
