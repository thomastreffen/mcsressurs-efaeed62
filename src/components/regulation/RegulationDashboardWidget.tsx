import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, ShieldCheck, ArrowRight, ShieldX } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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

interface DraftQuery {
  id: string;
  topic: string;
  question: string;
  scope_type: string;
  created_at: string;
  created_by: string;
}

export function RegulationDashboardWidget() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [drafts, setDrafts] = useState<DraftQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewDialog, setReviewDialog] = useState<{ id: string; action: "approved" | "rejected" } | null>(null);
  const [reviewComment, setReviewComment] = useState("");

  useEffect(() => {
    fetchDrafts();
  }, []);

  async function fetchDrafts() {
    setLoading(true);
    const { data } = await supabase
      .from("regulation_queries")
      .select("id, topic, question, scope_type, created_at, created_by")
      .eq("reviewed_status", "draft")
      .in("scope_type", ["job", "quote"])
      .order("created_at", { ascending: false })
      .limit(5);
    setDrafts((data as DraftQuery[]) || []);
    setLoading(false);
  }

  const handleReview = async () => {
    if (!user?.id || !reviewDialog) return;
    await supabase
      .from("regulation_queries")
      .update({
        reviewed_status: reviewDialog.action,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_comment: reviewComment.trim() || null,
      })
      .eq("id", reviewDialog.id);
    setDrafts(prev => prev.filter(d => d.id !== reviewDialog.id));
    toast.success(reviewDialog.action === "approved" ? "Godkjent" : "Avvist");
    setReviewDialog(null);
    setReviewComment("");
  };

  if (loading || drafts.length === 0) return null;

  return (
    <div className="rounded-2xl shadow-sm bg-card overflow-hidden">
      <div className="h-1 bg-primary/60" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
              <BookOpen className="h-4 w-4" /> Fag · Krever handling
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {drafts.length} utkast knyttet til aktive jobber/tilbud
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/fag?filter=draft")}
            className="gap-1 text-xs h-7"
          >
            Se alle <ArrowRight className="h-3 w-3" />
          </Button>
        </div>

        <div className="space-y-1.5">
          {drafts.map(d => (
            <div
              key={d.id}
              className="flex items-center gap-3 w-full rounded-xl p-3 hover:bg-secondary/50 transition-colors group"
            >
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/fag?id=${d.id}`)}>
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge variant="outline" className={`text-[10px] ${TOPIC_COLORS[d.topic] || TOPIC_COLORS.Annet}`}>
                    {d.topic}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{SCOPE_LABELS[d.scope_type]}</span>
                </div>
                <p className="text-sm font-medium truncate">{d.question}</p>
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(d.created_at), "d. MMM HH:mm", { locale: nb })}
                </p>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-success hover:bg-success/10"
                    onClick={(e) => { e.stopPropagation(); setReviewComment(""); setReviewDialog({ id: d.id, action: "approved" }); }}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                    onClick={(e) => { e.stopPropagation(); setReviewComment(""); setReviewDialog({ id: d.id, action: "rejected" }); }}
                  >
                    <ShieldX className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Review comment dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{reviewDialog?.action === "approved" ? "Godkjenn" : "Avvis"} fagforespørsel</DialogTitle>
          </DialogHeader>
          <Textarea
            value={reviewComment}
            onChange={e => setReviewComment(e.target.value)}
            placeholder="Valgfri kommentar (maks 200 tegn)…"
            maxLength={200}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(null)}>Avbryt</Button>
            <Button variant={reviewDialog?.action === "approved" ? "default" : "destructive"} onClick={handleReview}>
              {reviewDialog?.action === "approved" ? "Godkjenn" : "Avvis"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
