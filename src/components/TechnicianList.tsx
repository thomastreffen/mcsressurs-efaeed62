import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Users, Loader2 } from "lucide-react";

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
}

export function TechnicianList({ selectedId, onSelect, allowDeselect }: TechnicianListProps) {
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
            ? "bg-accent text-accent-foreground"
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

      {technicians.map((tech) => {
        const isSelected = selectedId === tech.id;
        const initial = tech.name.trim().charAt(0).toUpperCase();

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
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold shrink-0"
              style={{
                backgroundColor: tech.color ? `${tech.color}20` : "hsl(var(--muted))",
                color: tech.color || "hsl(var(--muted-foreground))",
              }}
            >
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{tech.name}</p>
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
