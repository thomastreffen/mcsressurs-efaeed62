import { useState } from "react";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface CalcLineSuggestion {
  title: string;
  category: string;
  estimate_hint: string;
}

interface Props {
  suggestedLines: CalcLineSuggestion[];
  suggestedReservations: string[];
  onAddCalcLines?: (lines: CalcLineSuggestion[]) => void;
  onAddReservations?: (reservations: string[]) => void;
}

export function RegulationCalcSuggestions({
  suggestedLines,
  suggestedReservations,
  onAddCalcLines,
  onAddReservations,
}: Props) {
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [selectedRes, setSelectedRes] = useState<Set<number>>(new Set());

  const toggleLine = (i: number) => {
    setSelectedLines(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const toggleRes = (i: number) => {
    setSelectedRes(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const handleAddLines = () => {
    if (selectedLines.size === 0) {
      toast.error("Velg minst én linje");
      return;
    }
    const lines = suggestedLines.filter((_, i) => selectedLines.has(i));
    onAddCalcLines?.(lines);
    toast.success(`${lines.length} linje(r) lagt til i kalkyle`);
    setSelectedLines(new Set());
  };

  const handleAddReservations = () => {
    if (selectedRes.size === 0) {
      toast.error("Velg minst ett forbehold");
      return;
    }
    const res = suggestedReservations.filter((_, i) => selectedRes.has(i));
    onAddReservations?.(res);
    toast.success(`${res.length} forbehold lagt til`);
    setSelectedRes(new Set());
  };

  return (
    <div className="space-y-4">
      {/* Suggested calc lines */}
      {suggestedLines.length > 0 && onAddCalcLines && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 text-primary" />
            Forslag til kalkylelinjer
          </p>
          <div className="space-y-2">
            {suggestedLines.map((line, i) => (
              <label key={i} className="flex items-start gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={selectedLines.has(i)}
                  onCheckedChange={() => toggleLine(i)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <span className="font-medium">{line.title}</span>
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    ({line.category === "labor" ? "Arbeid" : "Materiell"} · {line.estimate_hint})
                  </span>
                </div>
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={selectedLines.size === 0}
            onClick={handleAddLines}
          >
            <Plus className="h-3 w-3" />
            Legg til i kalkyle ({selectedLines.size})
          </Button>
        </div>
      )}

      {/* Suggested reservations */}
      {suggestedReservations.length > 0 && onAddReservations && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-accent" />
            Forslag til forbehold
          </p>
          <div className="space-y-2">
            {suggestedReservations.map((res, i) => (
              <label key={i} className="flex items-start gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={selectedRes.has(i)}
                  onCheckedChange={() => toggleRes(i)}
                  className="mt-0.5"
                />
                <span className="text-muted-foreground">{res}</span>
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={selectedRes.size === 0}
            onClick={handleAddReservations}
          >
            <FileText className="h-3 w-3" />
            Opprett forbehold ({selectedRes.size})
          </Button>
        </div>
      )}
    </div>
  );
}
