import { Shield, CheckCircle2, AlertTriangle, Info, Pin, PinOff } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RegulationQuery } from "@/hooks/useRegulationQueries";

const TOPIC_COLORS: Record<string, string> = {
  NEK: "bg-primary/10 text-primary border-primary/20",
  FEL: "bg-accent/10 text-accent border-accent/20",
  FSE: "bg-destructive/10 text-destructive border-destructive/20",
  FSL: "bg-success/10 text-success border-success/20",
  Annet: "bg-muted text-muted-foreground border-border",
};

const SCOPE_LABELS: Record<string, string> = {
  global: "Globalt",
  lead: "Lead",
  quote: "Tilbud",
  job: "Jobb",
};

interface Props {
  query: RegulationQuery;
  onPin?: (id: string, pinned: boolean) => void;
  compact?: boolean;
  onClick?: () => void;
}

export function RegulationAnswerCard({ query, onPin, compact, onClick }: Props) {
  const actions = Array.isArray(query.actions) ? query.actions : [];
  const pitfalls = Array.isArray(query.pitfalls) ? query.pitfalls : [];

  if (compact) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left rounded-xl border border-border/60 bg-card p-4 hover:bg-secondary/40 transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={`text-[10px] ${TOPIC_COLORS[query.topic] || TOPIC_COLORS.Annet}`}>
                {query.topic}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {SCOPE_LABELS[query.scope_type]}
              </span>
              {query.pinned && <Pin className="h-3 w-3 text-accent" />}
            </div>
            <p className="text-sm font-medium truncate">{query.question}</p>
            {query.answer_summary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{query.answer_summary}</p>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {format(new Date(query.created_at), "d. MMM", { locale: nb })}
          </span>
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-border/40">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`text-xs ${TOPIC_COLORS[query.topic] || TOPIC_COLORS.Annet}`}>
                {query.topic}
              </Badge>
              <span className="text-xs text-muted-foreground">{SCOPE_LABELS[query.scope_type]}</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(query.created_at), "d. MMM yyyy HH:mm", { locale: nb })}
              </span>
            </div>
            <h3 className="text-base font-semibold">{query.question}</h3>
          </div>
          {onPin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onPin(query.id, query.pinned)}
            >
              {query.pinned ? <PinOff className="h-4 w-4 text-accent" /> : <Pin className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Summary */}
      {query.answer_summary && (
        <div className="p-5 border-b border-border/40 bg-primary/[0.02]">
          <div className="flex items-start gap-2.5">
            <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-primary mb-1">Oppsummering</p>
              <p className="text-sm">{query.answer_summary}</p>
            </div>
          </div>
        </div>
      )}

      {/* Practical meaning */}
      {query.answer_detail && (
        <div className="p-5 border-b border-border/40">
          <div className="flex items-start gap-2.5">
            <Info className="h-4 w-4 text-info mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-info mb-1">Praktisk betydning</p>
              <p className="text-sm whitespace-pre-wrap">{query.answer_detail}</p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {actions.length > 0 && (
        <div className="p-5 border-b border-border/40">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium text-success mb-2">Anbefalte tiltak</p>
              <ul className="space-y-2">
                {actions.map((a, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{a.title}</span>
                    {a.description && <p className="text-muted-foreground mt-0.5">{a.description}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Pitfalls */}
      {pitfalls.length > 0 && (
        <div className="p-5 border-b border-border/40">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-accent mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium text-accent mb-2">Fallgruver</p>
              <ul className="space-y-2">
                {pitfalls.map((p, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{p.title}</span>
                    {p.description && <p className="text-muted-foreground mt-0.5">{p.description}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="px-5 py-3 bg-muted/30">
        <p className="text-[11px] text-muted-foreground italic">
          ⚠️ AI gir veiledning basert på kjente prinsipper. Original forskrift må alltid sjekkes ved tvil. Kontakt faglig ansvarlig ved behov.
        </p>
      </div>
    </div>
  );
}
