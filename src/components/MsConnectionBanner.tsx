import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Plug, X } from "lucide-react";

/**
 * Banner shown to technicians (montør) who haven't connected their Microsoft account.
 * Checks user_metadata for ms_access_token presence.
 */
export function MsConnectionBanner() {
  const { user, session, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!session?.user || isAdmin || dismissed) {
      setShow(false);
      return;
    }

    // Check if user has MS token in metadata
    const meta = session.user.user_metadata || {};
    const hasToken = !!meta.ms_access_token;
    setShow(!hasToken);
  }, [session, isAdmin, dismissed]);

  if (!show) return null;

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
        onClick={() => setDismissed(true)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
