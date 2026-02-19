import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { User, Loader2, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DBTech {
  id: string;
  name: string;
  user_id: string | null;
}

interface TechnicianMultiSelectProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function TechnicianMultiSelect({ selectedIds, onChange }: TechnicianMultiSelectProps) {
  const [technicians, setTechnicians] = useState<DBTech[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("technicians")
      .select("id, name, user_id")
      .not("user_id", "is", null)
      .order("name")
      .then(({ data }) => {
        const raw = data || [];
        const seen = new Set<string>();
        const unique = raw.filter((t) => {
          if (!t.id || !t.user_id || seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });
        setTechnicians(unique);
        setLoading(false);
      });
  }, []);

  const safeSelectedIds = Array.isArray(selectedIds) ? selectedIds : [];

  const toggle = (id: string) => {
    const safePrev = Array.isArray(safeSelectedIds) ? [...safeSelectedIds] : [];
    onChange(
      safePrev.includes(id)
        ? safePrev.filter(x => x !== id)
        : [...safePrev, id]
    );
  };

  const safeTechnicians = Array.isArray(technicians)
    ? technicians
        .filter(t => t && typeof t.id === "string" && t.id.length > 0)
        .filter((t, index, arr) =>
          arr.findIndex(x => x.id === t.id) === index
        )
    : [];

  console.log("Technicians rendered:", safeTechnicians);

  const filtered = search
    ? safeTechnicians.filter((t) => t.name?.toLowerCase().includes(search.toLowerCase()))
    : safeTechnicians;

  return (
    <div className="space-y-1.5">
      <Label>Montør(er)</Label>
      <div className="rounded-md border bg-background">
        <div className="flex items-center gap-2 px-2 py-1.5 border-b">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søk montør..."
            className="h-7 border-0 p-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
        <ScrollArea className="h-40">
          <div className="p-1 space-y-0.5">
            {loading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Ingen treff</p>
            ) : (
              filtered.map((tech) => {
                const checked = safeSelectedIds.includes(tech.id);
                return (
                  <button
                    type="button"
                    key={`tech-${tech.id}`}
                    onClick={() => toggle(tech.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors",
                      checked ? "bg-accent" : "hover:bg-secondary"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(tech.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <User className="h-3 w-3" />
                    </div>
                    <span className="text-sm">{tech.name ?? "Ukjent"}</span>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>
      {safeSelectedIds.length === 0 && (
        <p className="text-xs text-destructive">Velg minst én montør</p>
      )}
    </div>
  );
}
