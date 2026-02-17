import { useState } from "react";
import { TopBar } from "@/components/TopBar";
import { TechnicianList } from "@/components/TechnicianList";
import { WeekCalendar } from "@/components/WeekCalendar";
import { CreateJobDialog } from "@/components/CreateJobDialog";
import { JobDetailSheet } from "@/components/JobDetailSheet";
import { StatusLegend } from "@/components/StatusLegend";
import { technicians, type Job } from "@/lib/mock-data";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

export default function Dashboard() {
  const [selectedTechId, setSelectedTechId] = useState<string>(technicians[0].id);
  const [createJobOpen, setCreateJobOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobSheetOpen, setJobSheetOpen] = useState(false);

  const selectedTech = technicians.find((t) => t.id === selectedTechId);

  const handleJobClick = (job: Job) => {
    setSelectedJob(job);
    setJobSheetOpen(true);
  };

  return (
    <div className="flex h-screen flex-col">
      <TopBar onNewJob={() => setCreateJobOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r bg-card overflow-y-auto p-3">
          <TechnicianList
            selectedId={selectedTechId}
            onSelect={setSelectedTechId}
          />
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                {selectedTech?.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                Uke {format(new Date(), "w", { locale: nb })} ·{" "}
                {format(new Date(), "MMMM yyyy", { locale: nb })}
              </p>
            </div>
            <StatusLegend />
          </div>

          <WeekCalendar
            technicianId={selectedTechId}
            onJobClick={handleJobClick}
          />
        </main>
      </div>

      <CreateJobDialog
        open={createJobOpen}
        onOpenChange={setCreateJobOpen}
        preselectedTechId={selectedTechId}
      />

      <JobDetailSheet
        job={selectedJob}
        open={jobSheetOpen}
        onOpenChange={setJobSheetOpen}
      />
    </div>
  );
}
