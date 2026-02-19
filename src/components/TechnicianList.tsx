import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { User, Users, Loader2 } from "lucide-react";

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
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{
                backgroundColor: tech.color ? `${tech.color}20` : undefined,
                color: tech.color || undefined,
              }}
            >
              <User className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{tech.name}</p>
              <p className="text-xs text-muted-foreground truncate">{tech.email}</p>
            </div>
            {tech.color && (
              <span
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: tech.color }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
