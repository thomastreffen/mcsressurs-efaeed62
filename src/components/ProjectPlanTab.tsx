import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { TechnicianMultiSelect } from "./TechnicianMultiSelect";
import { JobCalendarSync } from "./JobCalendarSync";
import { ResourceAssignDialog } from "./ResourceAssignDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Plus,
  Clock,
  CalendarCheck,
  Users,
  CheckCircle2,
  Circle,
  Loader2,
  Trash2,
  GripVertical,
  ChevronDown,
  MapPin,
  PlayCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface JobTask {
  id: string;
  job_id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "done";
  sort_order: number;
  assigned_technician_ids: string[];
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
}

interface ProjectPlanTabProps {
  jobId: string;
  jobTitle: string;
  jobStart: Date;
  jobEnd: Date;
  jobAddress: string;
  technicianIds: string[];
  technicianNames: string[];
  isAdmin: boolean;
  calendarDirty?: boolean;
  calendarLastSyncedAt?: string | null;
  onSynced?: () => void;
  onResourceAssign?: () => void;
}

const STATUS_CONFIG = {
  pending: { label: "Venter", icon: Circle, className: "text-muted-foreground" },
  in_progress: { label: "Pågår", icon: PlayCircle, className: "text-amber-500" },
  done: { label: "Ferdig", icon: CheckCircle2, className: "text-emerald-500" },
};

export function ProjectPlanTab({
  jobId,
  jobTitle,
  jobStart,
  jobEnd,
  jobAddress,
  technicianIds,
  technicianNames,
  isAdmin,
  calendarDirty,
  calendarLastSyncedAt,
  onSynced,
  onResourceAssign,
}: ProjectPlanTabProps) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<JobTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [resourceAssignOpen, setResourceAssignOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from("job_tasks")
      .select("*")
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setTasks((data as JobTask[]) || []);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const addTask = async () => {
    if (!newTaskTitle.trim()) return;
    setAdding(true);
    const maxOrder = tasks.length > 0 ? Math.max(...tasks.map((t) => t.sort_order)) + 1 : 0;
    const { error } = await supabase.from("job_tasks").insert({
      job_id: jobId,
      title: newTaskTitle.trim(),
      sort_order: maxOrder,
      created_by: user?.id || null,
    });
    if (error) {
      toast.error("Kunne ikke legge til oppgave");
    } else {
      setNewTaskTitle("");
      fetchTasks();
    }
    setAdding(false);
  };

  const toggleTaskStatus = async (task: JobTask) => {
    const nextStatus: Record<string, string> = {
      pending: "in_progress",
      in_progress: "done",
      done: "pending",
    };
    const newStatus = nextStatus[task.status] as JobTask["status"];
    const updates: any = {
      status: newStatus,
      completed_at: newStatus === "done" ? new Date().toISOString() : null,
      completed_by: newStatus === "done" ? user?.id || null : null,
    };
    const { error } = await supabase
      .from("job_tasks")
      .update(updates)
      .eq("id", task.id);
    if (error) {
      toast.error("Kunne ikke oppdatere status");
    } else {
      fetchTasks();
      if (newStatus === "done") {
        toast.success("Oppgave fullført", { description: task.title });
      }
    }
  };

  const updateTaskTechs = async (taskId: string, techIds: string[]) => {
    const { error } = await supabase
      .from("job_tasks")
      .update({ assigned_technician_ids: techIds })
      .eq("id", taskId);
    if (!error) fetchTasks();
  };

  const updateTaskSchedule = async (
    taskId: string,
    field: "scheduled_date" | "start_time" | "end_time",
    value: string
  ) => {
    const { error } = await supabase
      .from("job_tasks")
      .update({ [field]: value || null })
      .eq("id", taskId);
    if (!error) fetchTasks();
  };

  const deleteTask = async (taskId: string) => {
    const { error } = await supabase.from("job_tasks").delete().eq("id", taskId);
    if (!error) {
      fetchTasks();
      toast.success("Oppgave slettet");
    }
  };

  const activeTasks = tasks.filter((t) => t.status !== "done");
  const completedTasks = tasks.filter((t) => t.status === "done");
  const completionPct = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ── Project overview header ── */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              Prosjektplan
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Organiser oppgaver, tildel ressurser og følg fremdrift
            </p>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl gap-1.5 shrink-0"
              onClick={() => setResourceAssignOpen(true)}
            >
              <Users className="h-3.5 w-3.5" />
              Legg til ressurs
            </Button>
          )}
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Tidspunkt
            </p>
            <p className="text-sm font-medium">
              {format(jobStart, "EEEE d. MMM", { locale: nb })}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(jobStart, "HH:mm")} – {format(jobEnd, "HH:mm")}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Adresse
            </p>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              {jobAddress || "—"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Montører
            </p>
            <div className="flex flex-wrap gap-1.5">
              {technicianNames.length > 0 ? (
                technicianNames.map((name, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {name}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Ingen tildelt</p>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {tasks.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">
                Fremdrift: {completedTasks.length}/{tasks.length} oppgaver
              </span>
              <span
                className={cn(
                  "font-bold tabular-nums",
                  completionPct === 100
                    ? "text-emerald-600"
                    : completionPct >= 50
                    ? "text-amber-600"
                    : "text-muted-foreground"
                )}
              >
                {completionPct}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted/80 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  completionPct === 100
                    ? "bg-emerald-500"
                    : completionPct >= 50
                    ? "bg-amber-500"
                    : "bg-primary/60"
                )}
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Task list ── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Oppgaver
            {tasks.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground font-normal">
                ({activeTasks.length} aktive)
              </span>
            )}
          </h3>
        </div>

        {/* Add task input */}
        {isAdmin && (
          <div className="px-5 py-3 border-b border-border/30 bg-muted/20">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addTask();
              }}
              className="flex gap-2"
            >
              <Input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Legg til ny oppgave..."
                className="flex-1"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!newTaskTitle.trim() || adding}
                className="gap-1.5 rounded-xl"
              >
                {adding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Legg til
              </Button>
            </form>
          </div>
        )}

        {/* Active tasks */}
        <div className="divide-y divide-border/30">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : activeTasks.length === 0 && completedTasks.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Ingen oppgaver ennå
              </p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Legg til oppgaver for å organisere arbeidet på prosjektet
              </p>
            </div>
          ) : (
            activeTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                isAdmin={isAdmin}
                expanded={expandedTaskId === task.id}
                onToggleExpand={() =>
                  setExpandedTaskId(
                    expandedTaskId === task.id ? null : task.id
                  )
                }
                onStatusToggle={() => toggleTaskStatus(task)}
                onUpdateTechs={(techs) => updateTaskTechs(task.id, techs)}
                onUpdateSchedule={(field, val) =>
                  updateTaskSchedule(task.id, field, val)
                }
                onDelete={() => deleteTask(task.id)}
              />
            ))
          )}
        </div>

        {/* Completed tasks */}
        {completedTasks.length > 0 && (
          <Collapsible open={showCompleted} onOpenChange={setShowCompleted}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-5 py-3 border-t border-border/40 bg-muted/10 hover:bg-muted/20 transition-colors text-left">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  {completedTasks.length} fullførte oppgaver
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground transition-transform",
                    showCompleted && "rotate-180"
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="divide-y divide-border/20">
                {completedTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isAdmin={isAdmin}
                    expanded={expandedTaskId === task.id}
                    onToggleExpand={() =>
                      setExpandedTaskId(
                        expandedTaskId === task.id ? null : task.id
                      )
                    }
                    onStatusToggle={() => toggleTaskStatus(task)}
                    onUpdateTechs={(techs) => updateTaskTechs(task.id, techs)}
                    onUpdateSchedule={(field, val) =>
                      updateTaskSchedule(task.id, field, val)
                    }
                    onDelete={() => deleteTask(task.id)}
                  />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {/* ── Outlook calendar sync ── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-5">
        <JobCalendarSync
          jobId={jobId}
          jobStart={jobStart}
          jobEnd={jobEnd}
          technicianIds={technicianIds}
          isAdmin={isAdmin}
          calendarDirty={calendarDirty}
          calendarLastSyncedAt={calendarLastSyncedAt}
          onSynced={onSynced}
        />
      </div>

      {/* Resource assign dialog */}
      <ResourceAssignDialog
        open={resourceAssignOpen}
        onOpenChange={setResourceAssignOpen}
        projectId={jobId}
        projectTitle={jobTitle}
        onAssigned={() => {
          onResourceAssign?.();
          fetchTasks();
        }}
      />
    </div>
  );
}

/* ── Task Row ── */
function TaskRow({
  task,
  isAdmin,
  expanded,
  onToggleExpand,
  onStatusToggle,
  onUpdateTechs,
  onUpdateSchedule,
  onDelete,
}: {
  task: JobTask;
  isAdmin: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onStatusToggle: () => void;
  onUpdateTechs: (ids: string[]) => void;
  onUpdateSchedule: (
    field: "scheduled_date" | "start_time" | "end_time",
    val: string
  ) => void;
  onDelete: () => void;
}) {
  const config = STATUS_CONFIG[task.status];
  const Icon = config.icon;
  const isDone = task.status === "done";

  return (
    <div
      className={cn(
        "transition-colors",
        isDone && "bg-muted/20 opacity-75"
      )}
    >
      <div className="flex items-center gap-3 px-5 py-3">
        {/* Status toggle */}
        <button
          onClick={onStatusToggle}
          className={cn(
            "shrink-0 transition-colors hover:scale-110",
            config.className
          )}
          title={`Status: ${config.label}. Klikk for å endre.`}
        >
          <Icon className="h-5 w-5" />
        </button>

        {/* Title & meta */}
        <button
          onClick={onToggleExpand}
          className="flex-1 text-left min-w-0"
        >
          <p
            className={cn(
              "text-sm font-medium truncate",
              isDone && "line-through text-muted-foreground"
            )}
          >
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.scheduled_date && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(task.scheduled_date), "d. MMM", {
                  locale: nb,
                })}
                {task.start_time &&
                  ` ${task.start_time.slice(0, 5)}–${(task.end_time || "").slice(0, 5)}`}
              </span>
            )}
            {task.assigned_technician_ids.length > 0 && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" />
                {task.assigned_technician_ids.length} ressurs(er)
              </span>
            )}
            {isDone && task.completed_at && (
              <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Ferdig{" "}
                {format(new Date(task.completed_at), "d. MMM HH:mm", {
                  locale: nb,
                })}
              </span>
            )}
          </div>
        </button>

        {/* Expand arrow */}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground shrink-0 transition-transform cursor-pointer",
            expanded && "rotate-180"
          )}
          onClick={onToggleExpand}
        />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-4 pt-1 ml-8 space-y-3 border-t border-border/20">
          {/* Schedule */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Dato
              </label>
              <Input
                type="date"
                value={task.scheduled_date || ""}
                onChange={(e) =>
                  onUpdateSchedule("scheduled_date", e.target.value)
                }
                className="mt-0.5 h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Start
              </label>
              <Input
                type="time"
                value={task.start_time?.slice(0, 5) || ""}
                onChange={(e) =>
                  onUpdateSchedule("start_time", e.target.value)
                }
                className="mt-0.5 h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Slutt
              </label>
              <Input
                type="time"
                value={task.end_time?.slice(0, 5) || ""}
                onChange={(e) =>
                  onUpdateSchedule("end_time", e.target.value)
                }
                className="mt-0.5 h-8 text-xs"
              />
            </div>
          </div>

          {/* Technicians */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Tildelte ressurser
            </label>
            <div className="mt-1">
              <TechnicianMultiSelect
                selectedIds={task.assigned_technician_ids}
                onChange={onUpdateTechs}
              />
            </div>
          </div>

          {/* Delete */}
          {isAdmin && (
            <div className="pt-2 border-t border-border/20 flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 text-xs"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Slett oppgave
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
