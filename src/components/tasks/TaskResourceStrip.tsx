import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ListTodo, GripVertical, Clock, AlertTriangle, User } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import type { Task, TaskAssignee } from "@/hooks/useTasks";

interface TaskWithAssignees extends Task {
  assignees: TaskAssignee[];
  assignee_names: string[];
}

interface TaskResourceStripProps {
  technicianUserId?: string | null;
  referenceDate: Date;
  onScheduleTask?: (taskId: string, start: Date, end: Date) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  high: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-300",
  normal: "border-primary/30 bg-primary/5 text-primary",
  low: "border-border bg-muted text-muted-foreground",
};

export function TaskResourceStrip({ technicianUserId, referenceDate, onScheduleTask }: TaskResourceStripProps) {
  const [tasks, setTasks] = useState<TaskWithAssignees[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setLoading(true);

    const { data: tasksData } = await (supabase as any)
      .from("tasks")
      .select("*")
      .in("status", ["open", "in_progress"])
      .is("planned_start_at", null)
      .order("due_at", { ascending: true })
      .limit(50);

    if (!tasksData || tasksData.length === 0) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const taskIds: string[] = (tasksData as any[]).map((t: any) => t.id as string);

    const { data: assigneesData } = await (supabase as any)
      .from("task_assignees")
      .select("*")
      .in("task_id", taskIds);

    const userIdSet = new Set<string>();
    (assigneesData || []).forEach((a: any) => { if (a.user_id) userIdSet.add(a.user_id); });
    const userIds: string[] = Array.from(userIdSet);
    let nameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: techData } = await supabase
        .from("technicians")
        .select("user_id, name")
        .in("user_id", userIds);
      nameMap = new Map((techData || []).map((t: any) => [t.user_id, t.name]));
    }

    let filteredTasks = tasksData as any[];
    if (technicianUserId) {
      const assignedTaskIds = new Set(
        (assigneesData || []).filter((a: any) => a.user_id === technicianUserId).map((a: any) => a.task_id)
      );
      filteredTasks = filteredTasks.filter((t: any) => assignedTaskIds.has(t.id));
    }

    const enriched: TaskWithAssignees[] = filteredTasks.map((t: any) => {
      const taskAssignees = (assigneesData || []).filter((a: any) => a.task_id === t.id) as TaskAssignee[];
      return {
        ...t,
        assignees: taskAssignees,
        assignee_names: taskAssignees.map((a: any) => nameMap.get(a.user_id) || "Ukjent"),
      };
    });

    setTasks(enriched);
    setLoading(false);
  }, [technicianUserId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  if (loading || tasks.length === 0) return null;

  return (
    <div className="mb-4 border border-border/40 rounded-xl bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 bg-muted/30">
        <ListTodo className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Uplanlagte oppgaver</span>
        <Badge variant="secondary" className="text-[10px] h-5">{tasks.length}</Badge>
      </div>
      <div className="flex gap-2 p-3 overflow-x-auto">
        {tasks.map(task => (
          <div
            key={task.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/task-id", task.id);
              e.dataTransfer.setData("text/plain", task.title);
              e.dataTransfer.effectAllowed = "move";
            }}
            className={`shrink-0 w-56 rounded-lg border p-3 cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.normal}`}
          >
            <div className="flex items-start gap-1.5">
              <GripVertical className="h-4 w-4 opacity-40 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{task.title}</p>
                <div className="flex items-center gap-2 mt-1 text-xs opacity-80">
                  {task.estimated_minutes && (
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      {task.estimated_minutes}m
                    </span>
                  )}
                  {task.due_at && (
                    <span className="flex items-center gap-0.5">
                      <AlertTriangle className="h-3 w-3" />
                      {format(new Date(task.due_at), "d. MMM", { locale: nb })}
                    </span>
                  )}
                </div>
                {task.assignee_names.length > 0 && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <User className="h-3 w-3 opacity-60" />
                    <span className="text-[11px] truncate">{task.assignee_names.join(", ")}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
