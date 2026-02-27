import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Wrench, MessageSquareText, UserPlus, FileText, Shield, PenTool } from "lucide-react";

export interface SuggestedAction {
  action_type: string;
  title: string;
  priority: string;
  due_at: string;
  estimated_minutes: number;
  rationale: string;
  suggested_assignee_ids: string[];
  suggested_attachment_document_ids: string[];
}

const ACTION_ICONS: Record<string, typeof Wrench> = {
  service: Wrench,
  clarification: MessageSquareText,
  assign_to_techs: UserPlus,
  offer_followup: FileText,
  fdv: PenTool,
  contract_review: Shield,
  drawing_review: PenTool,
};

const ACTION_LABELS: Record<string, string> = {
  service: "Opprett serviceoppgave",
  clarification: "Be om avklaring",
  assign_to_techs: "Send til montør",
  offer_followup: "Opprett tilbudsoppfølging",
  fdv: "Opprett FDV-oppgave",
  contract_review: "Kontraktsgjennomgang",
  drawing_review: "Gjennomgå tegning",
};

interface AIActionChipsProps {
  caseId: string;
  caseItemId?: string;
  onSelectAction: (action: SuggestedAction) => void;
}

export function AIActionChips({ caseId, caseItemId, onSelectAction }: AIActionChipsProps) {
  const [actions, setActions] = useState<SuggestedAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    supabase.functions
      .invoke("suggest-task-from-email", {
        body: { case_id: caseId, case_item_id: caseItemId },
      })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data) {
          setError(true);
          setLoading(false);
          return;
        }
        const suggested = data.suggested_actions || [];
        setActions(suggested.length > 0 ? suggested : []);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [caseId, caseItemId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        Analyserer e-post...
      </div>
    );
  }

  if (error || actions.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        <span className="text-xs font-medium text-violet-600 dark:text-violet-400">AI-forslag</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {actions.slice(0, 4).map((action, i) => {
          const Icon = ACTION_ICONS[action.action_type] || Wrench;
          const label = ACTION_LABELS[action.action_type] || action.title;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectAction(action)}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20 px-3 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950/40 transition-colors"
              title={action.rationale}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
