import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ActivityEntry } from "@/components/entity/ActivityTimeline";

export function useActivityLog(entityType: string, entityId: string | undefined) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchActivities = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("activity_log")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!data) { setActivities([]); return; }

      // Resolve performer names
      const performerIds = [...new Set((data as any[]).map(a => a.performed_by).filter(Boolean))];
      let techMap = new Map<string, string>();
      if (performerIds.length > 0) {
        const { data: techs } = await supabase
          .from("technicians")
          .select("user_id, name")
          .in("user_id", performerIds);
        techMap = new Map((techs || []).map((t: any) => [t.user_id, t.name]));
      }

      setActivities((data as any[]).map(a => ({
        id: a.id,
        type: a.type || "note",
        action: a.action,
        title: a.title,
        description: a.description,
        created_at: a.created_at,
        performer_name: techMap.get(a.performed_by) || "System",
        microsoft_event_id: a.microsoft_event_id,
        microsoft_message_id: a.microsoft_message_id,
        visibility: a.visibility,
        metadata: a.metadata as Record<string, any> | undefined,
      })));
    } catch (err) {
      console.warn("[useActivityLog] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  const logActivity = useCallback(async (params: {
    action: string;
    description: string;
    type?: string;
    title?: string;
    performedBy?: string;
    metadata?: Record<string, any>;
    microsoftEventId?: string;
    microsoftMessageId?: string;
    visibility?: string;
  }) => {
    if (!entityId) return;
    try {
      await supabase.from("activity_log").insert({
        entity_type: entityType,
        entity_id: entityId,
        action: params.action,
        description: params.description,
        type: params.type || "note",
        title: params.title || params.description,
        performed_by: params.performedBy,
        metadata: params.metadata || {},
        microsoft_event_id: params.microsoftEventId,
        microsoft_message_id: params.microsoftMessageId,
        visibility: params.visibility || "internal",
      });
    } catch (err) {
      console.warn("[useActivityLog] Log error:", err);
    }
  }, [entityType, entityId]);

  return { activities, loading, fetchActivities, logActivity };
}
