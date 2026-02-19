import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { TechnicianList } from "@/components/TechnicianList";
import { WeekCalendar } from "@/components/WeekCalendar";
import { CreateJobDialog } from "@/components/CreateJobDialog";
import { StatusLegend } from "@/components/StatusLegend";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import type { CalendarEvent } from "@/hooks/useCalendarEvents";

export default function Dashboard() {
  const navigate = useNavigate();
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [createJobOpen, setCreateJobOpen] = useState(false);

  const handleJobClick = (job: CalendarEvent) => {
    navigate(`/jobs/${job.id}`);
  };

  return (
    <div className="flex h-screen flex-col">
      <TopBar onNewJob={() => setCreateJobOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 border-r bg-card overflow-y-auto p-3">
          <TechnicianList
            selectedId={selectedTechId}
            onSelect={setSelectedTechId}
            allowDeselect
          />
        </aside>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                {selectedTechId ? "Kalender" : "Alle jobber"}
              </h2>
              <p className="text-sm text-muted-foreground">
                Uke {format(new Date(), "w", { locale: nb })} ·{" "}
                {format(new Date(), "MMMM yyyy", { locale: nb })}
              </p>
            </div>
            <StatusLegend />
          </div>

          <WeekCalendar technicianId={selectedTechId} onJobClick={handleJobClick} />
        </main>
      </div>

      <CreateJobDialog
        open={createJobOpen}
        onOpenChange={setCreateJobOpen}
        preselectedTechId={selectedTechId}
      />
    </div>
  );
}
