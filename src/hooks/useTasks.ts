import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Task {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  planned_start_at: string | null;
  planned_end_at: string | null;
  estimated_minutes: number | null;
  created_by: string;
  source_case_id: string | null;
  source_case_item_id: string | null;
  linked_work_order_id: string | null;
  linked_project_id: string | null;
  linked_lead_id: string | null;
  linked_offer_id: string | null;
  ai_suggested: boolean;
  ai_confidence: number | null;
  ai_rationale: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskAssignee {
  id: string;
  task_id: string;
  user_id: string;
  role: string;
  notified_at: string | null;
  calendar_event_id: string | null;
  created_at: string;
}

export function useTasks(filters?: { status?: string; assigneeUserId?: string }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let query = (supabase as any)
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (filters?.status) query = query.eq("status", filters.status);

    const { data } = await query;
    let result = (data as Task[]) || [];

    if (filters?.assigneeUserId) {
      const { data: assignments } = await (supabase as any)
        .from("task_assignees")
        .select("task_id")
        .eq("user_id", filters.assigneeUserId);
      const assignedTaskIds = new Set((assignments || []).map((a: any) => a.task_id));
      result = result.filter(t => assignedTaskIds.has(t.id));
    }

    setTasks(result);
    setLoading(false);
  }, [user, filters?.status, filters?.assigneeUserId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const createTask = useCallback(async (
    task: Omit<Task, "id" | "created_at" | "updated_at">,
    assigneeIds: string[],
    attachmentDocIds: string[]
  ) => {
    const { data, error } = await (supabase as any)
      .from("tasks")
      .insert(task)
      .select("id")
      .single();

    if (error || !data) throw error || new Error("Failed to create task");
    const taskId = (data as any).id;

    if (assigneeIds.length > 0) {
      await (supabase as any).from("task_assignees").insert(
        assigneeIds.map(uid => ({ task_id: taskId, user_id: uid, role: "executor" }))
      );

      const { data: taskData } = await (supabase as any).from("tasks").select("company_id, title").eq("id", taskId).single();
      if (taskData) {
        await (supabase as any).from("notifications").insert(
          assigneeIds.map(uid => ({
            user_id: uid,
            company_id: taskData.company_id,
            type: "task_assigned",
            title: "Ny oppgave tildelt",
            message: taskData.title,
            link_url: `/tasks/${taskId}`,
            read: false,
          }))
        );
      }
    }

    if (attachmentDocIds.length > 0) {
      await (supabase as any).from("task_attachments").insert(
        attachmentDocIds.map(docId => ({ task_id: taskId, document_id: docId }))
      );
    }

    await fetchTasks();
    return taskId;
  }, [fetchTasks]);

  const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    await (supabase as any).from("tasks").update(updates).eq("id", taskId);

    if (updates.planned_start_at || updates.planned_end_at) {
      const { data: assignees } = await (supabase as any)
        .from("task_assignees")
        .select("user_id")
        .eq("task_id", taskId);

      const { data: taskData } = await (supabase as any).from("tasks").select("company_id, title").eq("id", taskId).single();

      if (assignees && taskData) {
        await (supabase as any).from("notifications").insert(
          (assignees as any[]).map((a: any) => ({
            user_id: a.user_id,
            company_id: taskData.company_id,
            type: "task_rescheduled",
            title: "Oppgave omplanlagt",
            message: taskData.title,
            link_url: `/tasks/${taskId}`,
            read: false,
          }))
        );
      }

      try {
        await supabase.functions.invoke("sync-task-to-calendar", {
          body: { task_id: taskId },
        });
      } catch (e) {
        console.warn("Calendar sync failed:", e);
      }
    }

    await fetchTasks();
  }, [fetchTasks]);

  return { tasks, loading, createTask, updateTask, refetch: fetchTasks };
}
