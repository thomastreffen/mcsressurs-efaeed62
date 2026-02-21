import { useState } from "react";
import { Shield, CheckCircle2, AlertTriangle, Info, Pin, PinOff, BookMarked, ThumbsUp, ThumbsDown, ShieldCheck, ShieldX, FileText, MessageSquare, History } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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

const REVIEW_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Utkast", className: "bg-muted text-muted-foreground" },
  approved: { label: "Godkjent", className: "bg-success/10 text-success border-success/20" },
  rejected: { label: "Avvist", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

interface Props {
  query: RegulationQuery;
  onPin?: (id: string, pinned: boolean) => void;
  onRate?: (id: string, rating: number) => void;
  onReview?: (id: string, status: "approved" | "rejected", comment?: string) => void;
  canReview?: boolean;
  compact?: boolean;
  onClick?: () => void;
  versions?: RegulationQuery[];
  onSelectVersion?: (id: string) => void;
  onCreateRevision?: (query: RegulationQuery) => void;
}

export function RegulationAnswerCard({ query, onPin, onRate, onReview, canReview, compact, onClick, versions, onSelectVersion, onCreateRevision }: Props) {
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");
  const [reviewComment, setReviewComment] = useState("");

  const actions = Array.isArray(query.actions) ? query.actions : [];
  const pitfalls = Array.isArray(query.pitfalls) ? query.pitfalls : [];
  const references = Array.isArray(query.references_to_check) ? query.references_to_check : [];
  const reservations = Array.isArray(query.suggested_reservations) ? query.suggested_reservations : [];
  const reviewStatus = query.reviewed_status || "draft";

  const openReviewDialog = (action: "approved" | "rejected") => {
    setReviewAction(action);
    setReviewComment("");
    setReviewDialogOpen(true);
  };

  const confirmReview = () => {
    onReview?.(query.id, reviewAction, reviewComment.trim() || undefined);
    setReviewDialogOpen(false);
  };

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
              {reviewStatus !== "draft" && (
                <Badge variant="outline" className={`text-[10px] ${REVIEW_CONFIG[reviewStatus].className}`}>
                  {REVIEW_CONFIG[reviewStatus].label}
                </Badge>
              )}
              {query.pinned && <Pin className="h-3 w-3 text-accent" />}
              {query.parent_id && <History className="h-3 w-3 text-muted-foreground" />}
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
    <>
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border/40">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`text-xs ${TOPIC_COLORS[query.topic] || TOPIC_COLORS.Annet}`}>
                  {query.topic}
                </Badge>
                <Badge variant="outline" className={`text-xs ${REVIEW_CONFIG[reviewStatus].className}`}>
                  {REVIEW_CONFIG[reviewStatus].label}
                </Badge>
                <span className="text-xs text-muted-foreground">{SCOPE_LABELS[query.scope_type]}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(query.created_at), "d. MMM yyyy HH:mm", { locale: nb })}
                </span>
              </div>
              <h3 className="text-base font-semibold">{query.question}</h3>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onPin && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onPin(query.id, query.pinned)}>
                  {query.pinned ? <PinOff className="h-4 w-4 text-accent" /> : <Pin className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Versions */}
        {versions && versions.length > 1 && (
          <div className="px-5 py-3 border-b border-border/40 bg-secondary/20">
            <div className="flex items-center gap-2 flex-wrap">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Versjoner:</span>
              {versions.map((v, i) => (
                <Button
                  key={v.id}
                  variant={v.id === query.id ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => onSelectVersion?.(v.id)}
                >
                  v{i + 1}
                  {v.reviewed_status === "approved" && " ✓"}
                  {v.reviewed_status === "rejected" && " ✕"}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Review comment */}
        {query.review_comment && (
          <div className="px-5 py-3 border-b border-border/40 bg-muted/20">
            <div className="flex items-start gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground font-medium">
                  Kommentar fra {reviewStatus === "approved" ? "godkjenner" : "anmelder"}
                  {query.reviewed_at && ` · ${format(new Date(query.reviewed_at), "d. MMM HH:mm", { locale: nb })}`}
                </p>
                <p className="text-xs mt-0.5">{query.review_comment}</p>
              </div>
            </div>
          </div>
        )}

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

        {/* References to check */}
        {references.length > 0 && (
          <div className="p-5 border-b border-border/40">
            <div className="flex items-start gap-2.5">
              <BookMarked className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-medium text-primary mb-2">Mulige referanser å sjekke</p>
                <ul className="space-y-1">
                  {references.map((ref, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                      <span className="text-primary/60 mt-0.5">›</span>
                      {ref}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Suggested reservations */}
        {reservations.length > 0 && (
          <div className="p-5 border-b border-border/40">
            <div className="flex items-start gap-2.5">
              <FileText className="h-4 w-4 text-accent mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-medium text-accent mb-2">Forslag til forbehold</p>
                <ul className="space-y-1">
                  {reservations.map((res, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                      <span className="text-accent/60 mt-0.5">•</span>
                      {res}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Rating + Review actions */}
        <div className="px-5 py-3 border-b border-border/40 flex items-center gap-3 flex-wrap">
          {onRate && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Nyttig?</span>
              <Button
                variant={query.usefulness_rating === 1 ? "default" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => onRate(query.id, query.usefulness_rating === 1 ? 0 : 1)}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={query.usefulness_rating === -1 ? "destructive" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => onRate(query.id, query.usefulness_rating === -1 ? 0 : -1)}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          <div className="flex items-center gap-1 ml-auto">
            {/* Revision button when rejected */}
            {reviewStatus === "rejected" && onCreateRevision && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => onCreateRevision(query)}
              >
                <History className="h-3.5 w-3.5" /> Opprett revisjon
              </Button>
            )}

            {canReview && onReview && reviewStatus === "draft" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 text-success border-success/30 hover:bg-success/10"
                  onClick={() => openReviewDialog("approved")}
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> Godkjenn
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => openReviewDialog("rejected")}
                >
                  <ShieldX className="h-3.5 w-3.5" /> Avvis
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="px-5 py-3 bg-muted/30">
          <p className="text-[11px] text-muted-foreground italic">
            ⚠️ AI gir veiledning basert på kjente prinsipper. Original forskrift må alltid sjekkes ved tvil. Kontakt faglig ansvarlig ved behov.
          </p>
        </div>
      </div>

      {/* Review comment dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approved" ? "Godkjenn fagforespørsel" : "Avvis fagforespørsel"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground line-clamp-2">
              «{query.question}»
            </p>
            <Textarea
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
              placeholder="Valgfri kommentar (maks 200 tegn)…"
              maxLength={200}
              rows={3}
            />
            <p className="text-[10px] text-muted-foreground text-right">{reviewComment.length}/200</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Avbryt</Button>
            <Button
              variant={reviewAction === "approved" ? "default" : "destructive"}
              onClick={confirmReview}
            >
              {reviewAction === "approved" ? "Godkjenn" : "Avvis"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
