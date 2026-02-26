import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Users, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TechNowStatus } from "@/hooks/useTechnicianNowStatus";
import { toast } from "sonner";

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
  onColorChange?: (techId: string, color: string) => void;
}

const COLOR_PRESETS = [
  "#D50000", "#F4511E", "#E67C73", "#F09300",
  "#F6BF26", "#33B679", "#0B8043", "#7CB342",
  "#039BE5", "#3F51B5", "#7986CB", "#8E24AA",
  "#616161", "#795548", "#009688", "#C0CA33",
];

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

function ColorPicker({ currentColor, onPick }: { currentColor: string | null; onPick: (c: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5 p-2">
      {COLOR_PRESETS.map((c) => (
        <button
          key={c}
          onClick={(e) => { e.stopPropagation(); onPick(c); }}
          className={cn(
            "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
            currentColor === c ? "border-foreground scale-110 ring-2 ring-foreground/20" : "border-transparent"
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

export function TechnicianList({ selectedId, onSelect, allowDeselect, filterIds, nowStatusMap, onColorChange }: TechnicianListProps) {
  const [technicians, setTechnicians] = useState<DBTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null);

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

  const handleColorPick = useCallback(async (techId: string, color: string) => {
    // Optimistic update
    setTechnicians((prev) => prev.map((t) => t.id === techId ? { ...t, color } : t));
    setColorPickerOpen(null);
    onColorChange?.(techId, color);

    const { error } = await supabase
      .from("technicians")
      .update({ color })
      .eq("id", techId);

    if (error) {
      toast.error("Kunne ikke lagre farge");
      console.error("Color update failed:", error);
    }
  }, [onColorChange]);

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
        const techColor = tech.color || "#039BE5";

        return (
          <div key={tech.id} className="flex items-center gap-0">
            <button
              onClick={() => onSelect(tech.id)}
              className={cn(
                "flex-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors min-w-0",
                isSelected
                  ? "ring-1 ring-accent/20"
                  : "hover:bg-secondary"
              )}
              style={isSelected ? { backgroundColor: `${techColor}15` } : undefined}
            >
              <Popover
                open={colorPickerOpen === tech.id}
                onOpenChange={(open) => setColorPickerOpen(open ? tech.id : null)}
              >
                <PopoverTrigger asChild>
                  <div
                    className="relative cursor-pointer group"
                    onClick={(e) => { e.stopPropagation(); setColorPickerOpen(tech.id); }}
                  >
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold shrink-0 text-white transition-shadow group-hover:ring-2 group-hover:ring-offset-1"
                      style={{ backgroundColor: techColor, boxShadow: `0 0 0 0px ${techColor}` }}
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
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" side="right" align="start" onClick={(e) => e.stopPropagation()}>
                  <div className="p-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">Velg farge for {tech.name.split(" ")[0]}</p>
                    <ColorPicker currentColor={tech.color} onPick={(c) => handleColorPick(tech.id, c)} />
                  </div>
                </PopoverContent>
              </Popover>

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
                      backgroundColor: techColor,
                      opacity: 0.7,
                    }}
                  />
                </div>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
