import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TechnicianMultiSelect } from "@/components/TechnicianMultiSelect";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, X, Plus, Loader2, Crown, Eye, Wrench } from "lucide-react";
import { toast } from "sonner";

interface Assignee {
  id: string;
  task_id: string;
  user_id: string;
  role: string;
  tech_name?: string;
  tech_id?: string;
}

const ROLE_ICONS: Record<string, typeof Crown> = {
  owner: Crown,
  executor: Wrench,
  watcher: Eye,
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Ansvarlig",
  executor: "Utfører",
  watcher: "Observatør",
};

interface TaskAssigneeEditorProps {
  taskId: string;
  companyId: string;
  taskTitle: string;
  onChanged?: () => void;
}

export function TaskAssigneeEditor({ taskId, companyId, taskTitle, onChanged }: TaskAssigneeEditorProps) {
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addingIds, setAddingIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchAssignees = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("task_assignees")
      .select("id, task_id, user_id, role")
      .eq("task_id", taskId)
      .is("removed_at", null);

    const rows = (data || []) as Assignee[];

    // Resolve names via technicians table
    const userIds = rows.map(r => r.user_id).filter(Boolean);
    if (userIds.length > 0) {
      const { data: techs } = await supabase
        .from("technicians")
        .select("id, user_id, name")
        .in("user_id", userIds);

      const nameMap = new Map((techs || []).map((t: any) => [t.user_id, { name: t.name, id: t.id }]));
      rows.forEach(r => {
        const tech = nameMap.get(r.user_id);
        if (tech) {
          r.tech_name = tech.name;
          r.tech_id = tech.id;
        }
      });
    }

    setAssignees(rows);
    setLoading(false);
  }, [taskId]);

  useEffect(() => { fetchAssignees(); }, [fetchAssignees]);

  const handleRoleChange = async (assigneeId: string, newRole: string) => {
    await (supabase as any)
      .from("task_assignees")
      .update({ role: newRole })
      .eq("id", assigneeId);
    setAssignees(prev => prev.map(a => a.id === assigneeId ? { ...a, role: newRole } : a));
  };

  const handleRemove = async (assignee: Assignee) => {
    // Soft-delete
    await (supabase as any)
      .from("task_assignees")
      .update({ removed_at: new Date().toISOString() })
      .eq("id", assignee.id);

    // Notify removed user
    await (supabase as any).from("notifications").insert({
      user_id: assignee.user_id,
      company_id: companyId,
      type: "task_unassigned",
      title: "Fjernet fra oppgave",
      message: taskTitle,
      link_url: `/tasks/${taskId}`,
      read: false,
    });

    // Delete calendar event if exists
    if (assignee.user_id) {
      try {
        await supabase.functions.invoke("sync-task-to-calendar", {
          body: { task_id: taskId, remove_user_id: assignee.user_id },
        });
      } catch {}
    }

    toast.success(`${assignee.tech_name || "Bruker"} fjernet fra oppgaven`);
    fetchAssignees();
    onChanged?.();
  };

  const handleAdd = async () => {
    if (addingIds.length === 0) return;
    setSaving(true);

    // Resolve technician IDs to user IDs
    const { data: techs } = await supabase
      .from("technicians")
      .select("id, user_id")
      .in("id", addingIds);

    const existingUserIds = new Set(assignees.map(a => a.user_id));
    const newUsers = (techs || []).filter((t: any) => t.user_id && !existingUserIds.has(t.user_id));

    if (newUsers.length > 0) {
      const hasOwner = assignees.some(a => a.role === "owner");

      await (supabase as any).from("task_assignees").insert(
        newUsers.map((t: any, i: number) => ({
          task_id: taskId,
          user_id: t.user_id,
          role: !hasOwner && i === 0 && assignees.length === 0 ? "owner" : "executor",
        }))
      );

      // Notify new assignees
      await (supabase as any).from("notifications").insert(
        newUsers.map((t: any) => ({
          user_id: t.user_id,
          company_id: companyId,
          type: "task_assigned",
          title: "Ny oppgave tildelt",
          message: taskTitle,
          link_url: `/tasks/${taskId}`,
          read: false,
        }))
      );

      // Trigger calendar sync for new assignees
      try {
        await supabase.functions.invoke("sync-task-to-calendar", {
          body: { task_id: taskId },
        });
      } catch {}

      toast.success(`${newUsers.length} montør(er) lagt til`);
    }

    setAddingIds([]);
    setShowAdd(false);
    setSaving(false);
    fetchAssignees();
    onChanged?.();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Laster ansvarlige...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Ansvarlige ({assignees.length})</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs gap-1"
          onClick={() => setShowAdd(!showAdd)}
        >
          <Plus className="h-3 w-3" />
          Legg til
        </Button>
      </div>

      {/* Current assignees */}
      <div className="space-y-1">
        {assignees.map(a => {
          const RoleIcon = ROLE_ICONS[a.role] || Wrench;
          return (
            <div key={a.id} className="flex items-center gap-2 rounded-md border border-border/40 px-2 py-1.5 bg-muted/20">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                <User className="h-3 w-3" />
              </div>
              <span className="text-sm flex-1 truncate">{a.tech_name || "Ukjent"}</span>
              <Select value={a.role} onValueChange={(v) => handleRoleChange(a.id, v)}>
                <SelectTrigger className="h-6 w-24 text-[10px] border-0 bg-transparent">
                  <div className="flex items-center gap-1">
                    <RoleIcon className="h-3 w-3" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner" className="text-xs">Ansvarlig</SelectItem>
                  <SelectItem value="executor" className="text-xs">Utfører</SelectItem>
                  <SelectItem value="watcher" className="text-xs">Observatør</SelectItem>
                </SelectContent>
              </Select>
              <button
                onClick={() => handleRemove(a)}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                title="Fjern"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        {assignees.length === 0 && (
          <p className="text-xs text-muted-foreground py-1">Ingen tildelt ennå</p>
        )}
      </div>

      {/* Add technicians panel */}
      {showAdd && (
        <div className="border border-border rounded-lg p-3 space-y-3 bg-card">
          <TechnicianMultiSelect selectedIds={addingIds} onChange={setAddingIds} />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={addingIds.length === 0 || saving} className="gap-1 text-xs">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Legg til {addingIds.length > 0 ? `(${addingIds.length})` : ""}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setAddingIds([]); }} className="text-xs">
              Avbryt
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
