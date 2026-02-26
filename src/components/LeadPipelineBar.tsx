import { Check } from "lucide-react";
import { PIPELINE_STAGES, type LeadStatus } from "@/lib/lead-status";
import { cn } from "@/lib/utils";

interface LeadPipelineBarProps {
  currentStatus: LeadStatus;
  onStatusChange: (status: LeadStatus) => void;
}

const ACTIVE_STAGES = PIPELINE_STAGES.filter(s => s.key !== "won" && s.key !== "lost");
const TERMINAL_STAGES = PIPELINE_STAGES.filter(s => s.key === "won" || s.key === "lost");

export function LeadPipelineBar({ currentStatus, onStatusChange }: LeadPipelineBarProps) {
  const currentIdx = ACTIVE_STAGES.findIndex(s => s.key === currentStatus);
  const isTerminal = currentStatus === "won" || currentStatus === "lost";

  return (
    <div className="space-y-3">
      {/* Main pipeline steps */}
      <div className="flex items-center gap-0 overflow-x-auto">
        {ACTIVE_STAGES.map((stage, idx) => {
          const isPast = !isTerminal && currentIdx > idx;
          const isCurrent = !isTerminal && currentIdx === idx;
          const isFuture = isTerminal || currentIdx < idx;

          return (
            <button
              key={stage.key}
              onClick={() => onStatusChange(stage.key)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all whitespace-nowrap",
                "first:rounded-l-xl last:rounded-r-xl",
                "hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-primary/30",
                isCurrent && "text-white shadow-sm",
                isPast && "bg-primary/10 text-primary",
                isFuture && "bg-secondary/40 text-muted-foreground hover:bg-secondary/60",
              )}
              style={isCurrent ? { backgroundColor: stage.color } : undefined}
            >
              {isPast && <Check className="h-3 w-3 shrink-0" />}
              {isCurrent && (
                <span
                  className="h-2 w-2 rounded-full bg-white/80 shrink-0 animate-pulse"
                />
              )}
              <span className="hidden sm:inline">{stage.label}</span>
              <span className="sm:hidden">{stage.label.substring(0, 3)}</span>
              {/* Chevron connector */}
              {idx < ACTIVE_STAGES.length - 1 && (
                <span className="absolute -right-[5px] top-1/2 -translate-y-1/2 z-10 text-border/40">
                  ›
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Terminal states */}
      <div className="flex items-center gap-2">
        {TERMINAL_STAGES.map(stage => {
          const isActive = currentStatus === stage.key;
          return (
            <button
              key={stage.key}
              onClick={() => onStatusChange(stage.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                "border focus:outline-none focus:ring-2 focus:ring-primary/30",
                isActive
                  ? stage.key === "won"
                    ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800"
                    : "bg-destructive/10 text-destructive border-destructive/20"
                  : "bg-card text-muted-foreground border-border/40 hover:bg-secondary/40",
              )}
            >
              {isActive && <Check className="h-3 w-3" />}
              {stage.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
