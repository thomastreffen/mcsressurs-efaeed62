import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Users, Loader2 } from "lucide-react";
import type { TechNowStatus } from "@/hooks/useTechnicianNowStatus";

interface DBTechnician {
  id: string;
  name: string;
  email: string;
  user_id: string | null;
  color: string | null;
}

interface TechnicianListProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  allowDeselect?: boolean;
  filterIds?: Set<string> | null;
  nowStatusMap?: Map<string, TechNowStatus>;
}

function NowBadge({ status }: { status: TechNowStatus }) {
  const base = "text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap";
  if (status.state === "busy") {
    return (
      <span className={cn(base, "bg-destructive/10 text-destructive")}>
        {status.durationLabel || status.label}
      </span>
    );
  }
  return (
    <span className={cn(base, "bg-success/10 text-success")}>
      {status.durationLabel || status.label}
    </span>
  );
}

export function TechnicianList({ selectedId, onSelect, allowDeselect, filterIds, nowStatusMap }: TechnicianListProps) {
  const [technicians, setTechnicians] = useState<DBTechnician[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTechnicians() {
      const { data, error } = await supabase
        .from("technicians")
        .select("id, name, email, user_id, color")
        .not("user_id", "is", null)
        .eq("is_plannable_resource", true)
        .is("archived_at", null)
        .order("name");

      if (error) {
        console.error("Failed to fetch technicians:", error.message);
      } else {
        setTechnicians(data || []);
      }
      setLoading(false);
    }
    fetchTechnicians();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (technicians.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-muted-foreground">
        Ingen montører lagt til ennå.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <h2 className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Montører
      </h2>

      {/* Global view button */}
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
          selectedId === null
            ? "bg-accent/10 text-accent-foreground ring-1 ring-accent/20"
            : "hover:bg-secondary"
        )}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Users className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Alle montører</p>
          <p className="text-xs text-muted-foreground">Global oversikt</p>
        </div>
      </button>

      {technicians
        .filter((tech) => !filterIds || filterIds.has(tech.id))
        .map((tech) => {
        const isSelected = selectedId === tech.id;
        const initial = tech.name.trim().charAt(0).toUpperCase();
        const nowStatus = nowStatusMap?.get(tech.id);

        return (
          <button
            key={tech.id}
            onClick={() => onSelect(tech.id)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
              isSelected
                ? "bg-accent/10 text-accent-foreground ring-1 ring-accent/20"
                : "hover:bg-secondary"
            )}
          >
            <div className="relative">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold shrink-0"
                style={{
                  backgroundColor: tech.color ? `${tech.color}20` : "hsl(var(--muted))",
                  color: tech.color || "hsl(var(--muted-foreground))",
                }}
              >
                {initial}
              </div>
              {nowStatus && (
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
                    nowStatus.state === "busy" ? "bg-destructive" : "bg-success"
                  )}
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{tech.name}</p>
              {nowStatus && (
                <div className="mt-0.5">
                  <NowBadge status={nowStatus} />
                </div>
              )}
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: "45%",
                    backgroundColor: tech.color || "hsl(var(--primary))",
                    opacity: 0.7,
                  }}
                />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
