import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useRegulationQueries } from "@/hooks/useRegulationQueries";
import { RegulationAnswerCard } from "./RegulationAnswerCard";
import { RegulationCalcSuggestions } from "./RegulationCalcSuggestions";
import type { RegulationQuery } from "@/hooks/useRegulationQueries";

const TOPICS = ["NEK", "FEL", "FSE", "FSL", "Annet"] as const;

interface CalcLine {
  id: string;
  title: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopeType?: string;
  scopeId?: string;
  companyId?: string;
  calcLines?: CalcLine[];
  onSaved?: (query: RegulationQuery) => void;
  onAddCalcLines?: (lines: Array<{ title: string; category: string; estimate_hint: string }>) => void;
  onAddReservations?: (reservations: string[]) => void;
}

export function NewRegulationQueryDialog({
  open,
  onOpenChange,
  scopeType = "global",
  scopeId,
  companyId,
  calcLines,
  onSaved,
  onAddCalcLines,
  onAddReservations,
}: Props) {
  const [topic, setTopic] = useState<string>("NEK");
  const [question, setQuestion] = useState("");
  const [useCalcContext, setUseCalcContext] = useState(false);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegulationQuery | null>(null);

  const { submitQuery, rateQuery } = useRegulationQueries();

  const handleSubmit = async () => {
    if (!question.trim()) {
      toast.error("Skriv et spørsmål");
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      let contextJson: any = undefined;
      if (useCalcContext && calcLines && selectedLines.size > 0) {
        contextJson = calcLines.filter(l => selectedLines.has(l.id));
      }

      const data = await submitQuery({
        question,
        topic,
        scope_type: scopeType,
        scope_id: scopeId,
        context_json: contextJson,
        company_id: companyId,
      });

      const saved: RegulationQuery = {
        id: data.id || crypto.randomUUID(),
        created_at: new Date().toISOString(),
        created_by: "",
        scope_type: scopeType as any,
        scope_id: scopeId || null,
        topic,
        question,
        context_text: null,
        context_json: contextJson,
        answer_summary: data.summary,
        answer_detail: data.practical_meaning,
        actions: data.actions || [],
        pitfalls: data.pitfalls || [],
        tags: [],
        pinned: false,
        usefulness_rating: null,
        reviewed_status: "draft",
        reviewed_by: null,
        reviewed_at: null,
        references_to_check: data.references_to_check || [],
        suggested_reservations: data.suggested_reservations || [],
        suggested_calc_lines: data.suggested_calc_lines || [],
        usage_count: 0,
      };

      setResult(saved);
      onSaved?.(saved);
      toast.success("Fagforespørsel besvart");
    } catch (err: any) {
      toast.error("Kunne ikke generere svar", { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setQuestion("");
      setResult(null);
      setUseCalcContext(false);
      setSelectedLines(new Set());
    }, 300);
  };

  const toggleLine = (id: string) => {
    setSelectedLines(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Ny fagforespørsel</SheetTitle>
          <SheetDescription>
            Still spørsmål om forskrifter og normer (NEK, FEL, FSE, FSL)
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          {!result ? (
            <>
              <div className="space-y-2">
                <Label>Emne</Label>
                <Select value={topic} onValueChange={setTopic}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TOPICS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Spørsmål</Label>
                <Textarea
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder="F.eks: Hvilke krav stiller NEK 400 til jordfeilbryter i våtrom?"
                  rows={4}
                />
              </div>

              {calcLines && calcLines.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="useCalc"
                      checked={useCalcContext}
                      onCheckedChange={(v) => setUseCalcContext(!!v)}
                    />
                    <Label htmlFor="useCalc" className="cursor-pointer">
                      Bruk kalkylen som kontekst
                    </Label>
                  </div>

                  {useCalcContext && (
                    <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 space-y-2 max-h-48 overflow-y-auto">
                      {calcLines.map(line => (
                        <label key={line.id} className="flex items-start gap-2 cursor-pointer text-sm">
                          <Checkbox
                            checked={selectedLines.has(line.id)}
                            onCheckedChange={() => toggleLine(line.id)}
                            className="mt-0.5"
                          />
                          <div>
                            <span className="font-medium">{line.title}</span>
                            <span className="text-muted-foreground ml-1">
                              ({line.quantity} {line.unit})
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={submitting || !question.trim()}
                className="w-full gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyserer…
                  </>
                ) : (
                  "Send forespørsel"
                )}
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              <RegulationAnswerCard query={result} onRate={rateQuery} />

              {/* Calc line suggestions */}
              {(result.suggested_calc_lines?.length > 0 || result.suggested_reservations?.length > 0) && (
                <RegulationCalcSuggestions
                  suggestedLines={result.suggested_calc_lines || []}
                  suggestedReservations={result.suggested_reservations || []}
                  onAddCalcLines={onAddCalcLines}
                  onAddReservations={onAddReservations}
                />
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Lukk
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setResult(null);
                    setQuestion("");
                  }}
                  className="flex-1"
                >
                  Ny forespørsel
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
