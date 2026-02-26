import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface GraphConflict {
  eventId: string;
  graphVersion: {
    start: string;
    end: string;
    subject: string;
  } | null;
}

/**
 * Hook for syncing internal events to Microsoft Graph (Outlook).
 * Returns fire-and-forget helpers that show toasts on failure.
 */
export function useCalendarSync() {
  const [conflict, setConflict] = useState<GraphConflict | null>(null);

  const syncCreate = useCallback(async (eventId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("calendar-write-sync", {
        body: { action: "create", event_id: eventId },
      });
      if (error) {
        console.error("[CalendarSync] create invoke error:", error);
        return;
      }
      if (data?.status === "created") {
        console.log("[CalendarSync] Outlook event created:", data.graph_event_id);
      } else if (data?.status === "no_token") {
        // Silent – no MS connection
      } else if (data?.status === "error") {
        toast.error("Outlook ble ikke oppdatert", {
          description: `Feilkode ${data.code}`,
        });
      }
    } catch (err) {
      console.error("[CalendarSync] create exception:", err);
    }
  }, []);

  const syncUpdate = useCallback(async (eventId: string): Promise<"synced" | "conflict" | "error" | "no_token" | "unknown"> => {
    try {
      const { data, error } = await supabase.functions.invoke("calendar-write-sync", {
        body: { action: "update", event_id: eventId },
      });
      if (error) {
        console.error("[CalendarSync] update invoke error:", error);
        return "error";
      }
      if (data?.status === "updated" || data?.status === "created") {
        console.log("[CalendarSync] Outlook synced");
        return "synced";
      } else if (data?.status === "conflict") {
        setConflict({
          eventId,
          graphVersion: data.graph_version || null,
        });
        toast.warning("Outlook-konflikt oppdaget", {
          description: "Hendelsen har blitt endret i Outlook. Velg hvilken versjon du vil beholde.",
          duration: 8000,
        });
        return "conflict";
      } else if (data?.status === "no_token") {
        return "no_token";
      } else if (data?.status === "error") {
        toast.error("Outlook ble ikke oppdatert", {
          description: `Feilkode ${data.code}`,
        });
        return "error";
      }
      return "unknown";
    } catch (err) {
      console.error("[CalendarSync] update exception:", err);
      return "error";
    }
  }, []);

  const syncDelete = useCallback(async (eventId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("calendar-write-sync", {
        body: { action: "delete", event_id: eventId },
      });
      if (error) {
        console.error("[CalendarSync] delete invoke error:", error);
        return;
      }
      if (data?.status === "error") {
        toast.error("Outlook-event ble ikke slettet", {
          description: `Feilkode ${data.code}`,
        });
      }
    } catch (err) {
      console.error("[CalendarSync] delete exception:", err);
    }
  }, []);

  const forceUpdate = useCallback(async (eventId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("calendar-write-sync", {
        body: { action: "force_update", event_id: eventId },
      });
      if (error) {
        console.error("[CalendarSync] force_update invoke error:", error);
        return;
      }
      if (data?.status === "force_updated") {
        toast.success("Konflikt løst. Valgt: Systemtid ✓", {
          description: "Outlook er oppdatert med systemets tidspunkt.",
        });
        // Audit log
        await supabase.from("event_logs").insert({
          event_id: eventId,
          action_type: "conflict_resolved",
          change_summary: "Konflikt løst: Systemtid valgt (force_update)",
        });
        setConflict(null);
      } else if (data?.status === "error") {
        toast.error("Kunne ikke tvinge Outlook-oppdatering");
      }
    } catch (err) {
      console.error("[CalendarSync] force_update exception:", err);
    }
  }, []);

  const acceptGraphVersion = useCallback(async (eventId: string, graphStart: string, graphEnd: string) => {
    try {
      await supabase.from("events").update({
        start_time: new Date(graphStart).toISOString(),
        end_time: new Date(graphEnd).toISOString(),
      }).eq("id", eventId);

      toast.success("Konflikt løst. Valgt: Outlook-tid ✓", {
        description: "Databasen er oppdatert med Outlook-tidspunktet.",
      });
      // Audit log
      await supabase.from("event_logs").insert({
        event_id: eventId,
        action_type: "conflict_resolved",
        change_summary: `Konflikt løst: Outlook-tid valgt (${graphStart} – ${graphEnd})`,
      });
      setConflict(null);
    } catch (err) {
      console.error("[CalendarSync] acceptGraph exception:", err);
      toast.error("Kunne ikke oppdatere med Outlook-tid");
    }
  }, []);

  const dismissConflict = useCallback(() => setConflict(null), []);

  return {
    syncCreate,
    syncUpdate,
    syncDelete,
    forceUpdate,
    acceptGraphVersion,
    conflict,
    dismissConflict,
  };
}
