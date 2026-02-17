import { technicians, getJobsForTechnician } from "@/lib/mock-data";
import { StatusDot } from "./StatusDot";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";

interface TechnicianListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function TechnicianList({ selectedId, onSelect }: TechnicianListProps) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Montører
      </h2>
      {technicians.map((tech) => {
        const jobs = getJobsForTechnician(tech.id);
        const todayJobs = jobs.filter(
          (j) => j.start.toDateString() === new Date().toDateString()
        );
        const isSelected = selectedId === tech.id;

        return (
          <button
            key={tech.id}
            onClick={() => onSelect(tech.id)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
              isSelected
                ? "bg-accent text-accent-foreground"
                : "hover:bg-secondary"
            )}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{tech.name}</p>
              <p className="text-xs text-muted-foreground">
                {todayJobs.length} jobb{todayJobs.length !== 1 ? "er" : ""} i dag
              </p>
            </div>
            <div className="flex gap-1">
              {todayJobs.map((j) => (
                <StatusDot key={j.id} status={j.status} />
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
