import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { User, Loader2 } from "lucide-react";

interface DBTech {
  id: string;
  name: string;
}

interface TechnicianMultiSelectProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function TechnicianMultiSelect({ selectedIds, onChange }: TechnicianMultiSelectProps) {
  const [technicians, setTechnicians] = useState<DBTech[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("technicians")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        setTechnicians(data || []);
        setLoading(false);
      });
  }, []);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label>Montør(er)</Label>
      <div className="rounded-md border bg-background p-2 space-y-1 max-h-40 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          technicians.map((tech) => {
            const checked = selectedIds.includes(tech.id);
            return (
              <button
                type="button"
                key={tech.id}
                onClick={() => toggle(tech.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors",
                  checked ? "bg-accent" : "hover:bg-secondary"
                )}
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(tech.id)} />
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-3 w-3" />
                </div>
                <span className="text-sm">{tech.name}</span>
              </button>
            );
          })
        )}
      </div>
      {selectedIds.length === 0 && (
        <p className="text-xs text-destructive">Velg minst én montør</p>
      )}
    </div>
  );
}
