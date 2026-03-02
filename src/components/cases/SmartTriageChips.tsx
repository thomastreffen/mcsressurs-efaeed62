import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Loader2, AlertTriangle, ArrowRight, UserCheck,
  CalendarDays, Tag, CheckCircle, AtSign, ListTodo,
} from "lucide-react";
import { toast } from "sonner";

interface TriageSuggestion {
  priority: string;
  status: string;
  next_action: string;
  suggested_owner_role: string;
  due_days: number;
  convert_to: string | null;
  rationale: string;
  mention_signal?: {
    mentioned_user_ids: string[];
    confidence_boost: number;
    reasoning: string;
  };
  suggested_owner_user_id?: string | null;
  suggested_task?: {
    title: string;
    description?: string;
    due_at: string;
    priority: string;
    assignees: { user_id: string; role?: string }[];
  } | null;
}

interface SmartTriageChipsProps {
  caseId: string;
  caseTitle: string;
  currentStatus: string;
  currentPriority: string;
  mentionedUserIds?: string[];
  onApplySuggestion: (updates: Record<string, any>) => void;
  onAssignUser?: (userId: string) => void;
  onCreateTask?: (task: { title: string; assigneeId?: string; dueAt?: string; priority?: string }) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "border-destructive/40 text-destructive bg-destructive/5",
  high: "border-orange-300 text-orange-700 bg-orange-50 dark:border-orange-800 dark:text-orange-400 dark:bg-orange-950/20",
  normal: "border-border text-foreground",
  low: "border-muted text-muted-foreground",
};

export function SmartTriageChips({
  caseId,
  caseTitle,
  currentStatus,
  currentPriority,
  mentionedUserIds,
  onApplySuggestion,
  onAssignUser,
  onCreateTask,
}: SmartTriageChipsProps) {
  const [suggestion, setSuggestion] = useState<TriageSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [applied, setApplied] = useState(false);
  const [ownerName, setOwnerName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setApplied(false);

    supabase.functions
      .invoke("suggest-task-from-email", {
        body: {
          case_id: caseId,
          triage_mode: true,
          mentioned_user_ids: mentionedUserIds || [],
        },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.triage) {
          setLoading(false);
          return;
        }
        setSuggestion(data.triage);

        // Resolve suggested owner name
        if (data.triage.suggested_owner_user_id) {
          supabase
            .from("technicians")
            .select("name")
            .eq("user_id", data.triage.suggested_owner_user_id)
            .maybeSingle()
            .then(({ data: tech }) => {
              if (!cancelled && tech?.name) setOwnerName(tech.name);
            });
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [caseId, mentionedUserIds?.join(",")]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <Sparkles className="h-3 w-3 text-violet-500" />
        Analyserer...
      </div>
    );
  }

  if (!suggestion || applied) return null;

  const hasDiff = suggestion.priority !== currentPriority || suggestion.status !== currentStatus;
  const hasMentionSuggestion = !!suggestion.suggested_owner_user_id;
  const hasTask = !!suggestion.suggested_task;
  if (!hasDiff && !suggestion.convert_to && !hasMentionSuggestion && !hasTask) return null;

  const handleApply = () => {
    const updates: Record<string, any> = {};
    if (suggestion.priority !== currentPriority) updates.priority = suggestion.priority;
    if (suggestion.status !== currentStatus) updates.status = suggestion.status;
    if (suggestion.next_action) updates.next_action = suggestion.next_action;
    if (suggestion.due_days) {
      const d = new Date();
      d.setDate(d.getDate() + suggestion.due_days);
      updates.due_at = d.toISOString();
    }
    onApplySuggestion(updates);
    setApplied(true);
    toast.success("AI-forslag brukt");
  };

  const handleAssign = () => {
    if (suggestion.suggested_owner_user_id && onAssignUser) {
      onAssignUser(suggestion.suggested_owner_user_id);
      toast.success(`Tildelt til ${ownerName || "bruker"}`);
    }
  };

  const handleCreateTask = () => {
    if (suggestion.suggested_task && onCreateTask) {
      onCreateTask({
        title: suggestion.suggested_task.title,
        assigneeId: suggestion.suggested_owner_user_id || undefined,
        dueAt: suggestion.suggested_task.due_at,
        priority: suggestion.suggested_task.priority,
      });
    }
  };

  return (
    <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/10 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        <span className="text-xs font-medium text-violet-700 dark:text-violet-300">AI-triage forslag</span>
        {suggestion.mention_signal && suggestion.mention_signal.mentioned_user_ids.length > 0 && (
          <Badge variant="outline" className="text-[10px] gap-1 border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400">
            <AtSign className="h-3 w-3" />
            Mention-signal
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {suggestion.priority !== currentPriority && (
          <Badge variant="outline" className={`text-[10px] gap-1 ${PRIORITY_COLORS[suggestion.priority] || ""}`}>
            <AlertTriangle className="h-3 w-3" />
            Prioritet: {suggestion.priority}
          </Badge>
        )}
        {suggestion.next_action && suggestion.next_action !== "none" && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <ArrowRight className="h-3 w-3" />
            Neste: {suggestion.next_action}
          </Badge>
        )}
        {suggestion.suggested_owner_role && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <UserCheck className="h-3 w-3" />
            {suggestion.suggested_owner_role}
          </Badge>
        )}
        {suggestion.due_days && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <CalendarDays className="h-3 w-3" />
            Frist: {suggestion.due_days}d
          </Badge>
        )}
        {suggestion.convert_to && (
          <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
            <Tag className="h-3 w-3" />
            Konverter til {suggestion.convert_to}
          </Badge>
        )}
      </div>

      {suggestion.rationale && (
        <p className="text-xs text-muted-foreground">{suggestion.rationale}</p>
      )}
      {suggestion.mention_signal?.reasoning && (
        <p className="text-xs text-muted-foreground italic">{suggestion.mention_signal.reasoning}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {hasDiff && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-7 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30"
            onClick={handleApply}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Bruk forslag
          </Button>
        )}
        {hasMentionSuggestion && onAssignUser && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-7 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30"
            onClick={handleAssign}
          >
            <UserCheck className="h-3.5 w-3.5" />
            Tildel til {ownerName || "nevnt bruker"}
          </Button>
        )}
        {hasTask && onCreateTask && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-7 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30"
            onClick={handleCreateTask}
          >
            <ListTodo className="h-3.5 w-3.5" />
            Opprett oppgave{ownerName ? ` til ${ownerName}` : ""}
          </Button>
        )}
      </div>
    </div>
  );
}
