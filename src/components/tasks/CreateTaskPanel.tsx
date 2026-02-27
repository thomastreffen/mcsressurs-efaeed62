import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useTasks } from "@/hooks/useTasks";
import { TechnicianMultiSelect } from "@/components/TechnicianMultiSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sparkles, Loader2, ListTodo, Clock, AlertTriangle, X, CheckCircle2,
  Paperclip, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import type { SuggestedAction } from "@/components/tasks/AIActionChips";

interface CreateTaskPanelProps {
  caseId: string;
  caseItemId?: string;
  companyId: string;
  linkedWorkOrderId?: string | null;
  linkedProjectId?: string | null;
  linkedLeadId?: string | null;
  linkedOfferId?: string | null;
  documents?: { id: string; file_name: string }[];
  prefillAction?: SuggestedAction | null;
  onClose: () => void;
  onCreated?: (taskId: string) => void;
}

interface AISuggestion {
  title: string;
  priority: string;
  due_at: string;
  estimated_minutes: number;
  rationale: string;
  suggested_assignee_ids: string[];
  ai_confidence: number;
}

export function CreateTaskPanel({
  caseId,
  caseItemId,
  companyId,
  linkedWorkOrderId,
  linkedProjectId,
  linkedLeadId,
  linkedOfferId,
  documents = [],
  prefillAction,
  onClose,
  onCreated,
}: CreateTaskPanelProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { createTask } = useTasks();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueAt, setDueAt] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(60);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);

  // If prefillAction provided, use it immediately; otherwise fetch AI suggestion
  useEffect(() => {
    if (prefillAction) {
      setTitle(prefillAction.title || "");
      setPriority(prefillAction.priority || "normal");
      setDueAt(prefillAction.due_at ? format(new Date(prefillAction.due_at), "yyyy-MM-dd") : "");
      setEstimatedMinutes(prefillAction.estimated_minutes || 60);
      setAiSuggestion({
        title: prefillAction.title,
        priority: prefillAction.priority,
        due_at: prefillAction.due_at,
        estimated_minutes: prefillAction.estimated_minutes,
        rationale: prefillAction.rationale,
        suggested_assignee_ids: prefillAction.suggested_assignee_ids || [],
        ai_confidence: 0.7,
      });
      // Pre-select suggested attachments
      if (prefillAction.suggested_attachment_document_ids?.length) {
        setSelectedDocIds(prefillAction.suggested_attachment_document_ids.filter(
          id => documents.some(d => d.id === id)
        ));
      }
      // Resolve assignees
      if (prefillAction.suggested_assignee_ids?.length) {
        supabase
          .from("technicians")
          .select("id, user_id")
          .in("user_id", prefillAction.suggested_assignee_ids)
          .then(({ data: techs }) => {
            if (techs) setAssigneeIds(techs.map((t: any) => t.id));
          });
      }
    } else {
      fetchAISuggestion();
    }
  }, []);

  const fetchAISuggestion = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-task-from-email", {
        body: { case_id: caseId, case_item_id: caseItemId },
      });
      if (error) throw error;
      if (data) {
        setAiSuggestion(data);
        // Prefill
        setTitle(data.title || "");
        setPriority(data.priority || "normal");
        setDueAt(data.due_at ? format(new Date(data.due_at), "yyyy-MM-dd") : "");
        setEstimatedMinutes(data.estimated_minutes || 60);
        if (data.suggested_assignee_ids?.length) {
          // Map user_ids to technician_ids for TechnicianMultiSelect
          const { data: techs } = await supabase
            .from("technicians")
            .select("id, user_id")
            .in("user_id", data.suggested_assignee_ids);
          if (techs) setAssigneeIds(techs.map((t: any) => t.id));
        }
      }
    } catch (e) {
      console.warn("AI suggestion failed:", e);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !user) return;
    setSaving(true);
    try {
      // Resolve technician IDs to user IDs for assignees
      let userIds: string[] = [];
      if (assigneeIds.length > 0) {
        const { data: techs } = await supabase
          .from("technicians")
          .select("id, user_id")
          .in("id", assigneeIds);
        userIds = (techs || []).map((t: any) => t.user_id).filter(Boolean);
      }

      const taskId = await createTask(
        {
          company_id: companyId,
          title: title.trim(),
          description: description.trim() || null,
          status: "open",
          priority,
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
          planned_start_at: null,
          planned_end_at: null,
          estimated_minutes: estimatedMinutes || null,
          created_by: user.id,
          source_case_id: caseId,
          source_case_item_id: caseItemId || null,
          linked_work_order_id: linkedWorkOrderId || null,
          linked_project_id: linkedProjectId || null,
          linked_lead_id: linkedLeadId || null,
          linked_offer_id: linkedOfferId || null,
          ai_suggested: !!aiSuggestion,
          ai_confidence: aiSuggestion?.ai_confidence || null,
          ai_rationale: aiSuggestion?.rationale || null,
        },
        userIds,
        selectedDocIds
      );

      setCreatedTaskId(taskId);
      toast.success("Oppgave opprettet!", {
        action: {
          label: "Åpne oppgave",
          onClick: () => navigate(`/projects/plan`),
        },
      });
      onCreated?.(taskId);
    } catch (e: any) {
      toast.error("Kunne ikke opprette oppgave: " + (e.message || "Ukjent feil"));
    } finally {
      setSaving(false);
    }
  };

  if (createdTaskId) {
    return (
      <div className="border border-border rounded-xl p-6 bg-card space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="font-medium text-foreground">Oppgave opprettet</p>
            <p className="text-sm text-muted-foreground">{title}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/projects/plan")} className="gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" />
            Åpne i Ressursplan
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Lukk
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Opprett oppgave</h3>
          {aiSuggestion && (
            <Badge variant="outline" className="text-[10px] h-5 border-violet-200 text-violet-600 dark:border-violet-800 dark:text-violet-400">
              <Sparkles className="h-2.5 w-2.5 mr-0.5" />
              AI-foreslått
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {aiLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyserer e-post med AI...
          </div>
        )}

        {aiSuggestion?.rationale && !aiLoading && (
          <div className="flex items-start gap-2 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 p-3">
            <Sparkles className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
            <p className="text-xs text-violet-700 dark:text-violet-300">{aiSuggestion.rationale}</p>
          </div>
        )}

        {/* Title */}
        <div className="space-y-1.5">
          <Label>Tittel</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Oppgavetittel..." />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label>Beskrivelse</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Valgfri beskrivelse..."
            className="min-h-[60px]"
          />
        </div>

        {/* Priority + Due date + Estimate */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Prioritet</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Lav</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">Høy</SelectItem>
                <SelectItem value="critical">Kritisk</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Frist</Label>
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Estimat (min)
            </Label>
            <Input
              type="number"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
              className="h-9"
              min={0}
              step={15}
            />
          </div>
        </div>

        {/* Assignees */}
        <TechnicianMultiSelect selectedIds={assigneeIds} onChange={setAssigneeIds} />

        {/* Document attachments */}
        {documents.length > 0 && (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              Vedlegg fra e-post
            </Label>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {documents.map((doc) => (
                <label
                  key={doc.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedDocIds.includes(doc.id)}
                    onCheckedChange={(checked) => {
                      setSelectedDocIds((prev) =>
                        checked ? [...prev, doc.id] : prev.filter((id) => id !== doc.id)
                      );
                    }}
                  />
                  <span className="text-sm truncate">{doc.file_name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={!title.trim() || saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListTodo className="h-4 w-4" />}
            Opprett oppgave
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
        </div>
      </div>
    </div>
  );
}
