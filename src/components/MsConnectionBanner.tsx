import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Plug, X, Loader2 } from "lucide-react";

const DISMISS_KEY = "ms_banner_dismissed_at";
const DISMISS_HOURS = 24;

export function MsConnectionBanner() {
  const { user, session, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user || isAdmin) {
      setShow(false);
      setLoading(false);
      return;
    }

    // Check dismiss timestamp
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < DISMISS_HOURS * 60 * 60 * 1000) {
        setShow(false);
        setLoading(false);
        return;
      }
    }

    // Check connection via edge function (not metadata directly)
    const checkConnection = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ms-debug", {
          body: { action: "check_connection" },
        });
        if (error || !data?.connected) {
          // Also check if user has assigned jobs with missing_token failures
          const hasFailedJobs = await checkFailedJobs();
          // Show if not connected OR has failed jobs
          setShow(!data?.connected || hasFailedJobs);
        } else {
          setShow(false);
        }
      } catch {
        // On error, don't show banner to avoid noise
        setShow(false);
      } finally {
        setLoading(false);
      }
    };

    checkConnection();
  }, [session, isAdmin]);

  const checkFailedJobs = async (): Promise<boolean> => {
    try {
      // Check if any job_calendar_links for this user have failed/missing_token
      const { data } = await supabase
        .from("job_calendar_links")
        .select("id")
        .eq("user_id", session?.user?.id || "")
        .eq("sync_status", "failed")
        .limit(1);
      return (data?.length || 0) > 0;
    } catch {
      return false;
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setShow(false);
  };

  if (loading || !show) return null;

  return (
    <div className="flex items-center gap-3 border-b bg-primary/5 border-primary/20 px-4 py-2.5">
      <Plug className="h-4 w-4 text-primary shrink-0" />
      <p className="text-sm flex-1">
        <span className="font-medium">Koble Microsoft 365</span>
        <span className="text-muted-foreground"> for å motta jobber i Outlook-kalenderen din.</span>
      </p>
      <Button
        size="sm"
        onClick={() => navigate("/settings/integrations")}
        className="gap-1.5 shrink-0"
      >
        <Plug className="h-3.5 w-3.5" />
        Koble til
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={handleDismiss}
        title="Skjul i 24 timer"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
