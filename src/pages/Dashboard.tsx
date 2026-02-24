import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { TechnicianList } from "@/components/TechnicianList";
import { WeekCalendar } from "@/components/WeekCalendar";
import { CreateJobDialog } from "@/components/CreateJobDialog";
import { StatusLegend } from "@/components/StatusLegend";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CalendarEvent } from "@/hooks/useCalendarEvents";

export default function Dashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [createJobOpen, setCreateJobOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleJobClick = (job: CalendarEvent) => {
    navigate(`/projects/${job.id}`);
  };

  const handleSelectTech = (id: string | null) => {
    setSelectedTechId(id);
    if (isMobile) setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        onNewJob={() => setCreateJobOpen(true)}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        showMenuButton={isMobile}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        {!isMobile && (
          <aside className="w-64 shrink-0 border-r bg-card overflow-y-auto p-3">
            <TechnicianList
              selectedId={selectedTechId}
              onSelect={setSelectedTechId}
              allowDeselect
            />
          </aside>
        )}

        {/* Mobile sidebar as sheet */}
        {isMobile && (
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="w-72 p-3">
              <TechnicianList
                selectedId={selectedTechId}
                onSelect={handleSelectTech}
                allowDeselect
              />
            </SheetContent>
          </Sheet>
        )}

        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold">
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
