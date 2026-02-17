import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (window.opener) {
      // We're in a popup — send code back to parent
      if (code) {
        window.opener.postMessage({ type: "microsoft-auth-code", code }, "*");
      } else if (error) {
        window.opener.postMessage({ type: "microsoft-auth-error", error }, "*");
      }
      window.close();
      return;
    }

    // Not in a popup (redirect flow) — handle code directly
    if (error) {
      toast.error("Innlogging feilet", { description: error });
      navigate("/login", { replace: true });
      return;
    }

    if (code && !processing) {
      setProcessing(true);
      const redirectUri = `${window.location.origin}/auth/callback`;

      const timeout = setTimeout(() => {
        toast.error("Innlogging tok for lang tid");
        navigate("/login", { replace: true });
      }, 15000);

      supabase.functions
        .invoke("auth-callback", {
          body: { code, redirect_uri: redirectUri },
        })
        .then(async ({ data, error: fnError }) => {
          clearTimeout(timeout);

          if (fnError || !data?.session) {
            toast.error("Innlogging feilet", {
              description: data?.error || fnError?.message || "Kunne ikke logge inn.",
            });
            navigate("/login", { replace: true });
            return;
          }

          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });

          toast.success("Innlogget", {
            description: `Velkommen, ${data.user.name}!`,
          });
          navigate("/", { replace: true });
        })
        .catch((err) => {
          clearTimeout(timeout);
          console.error("Auth callback error:", err);
          toast.error("Innlogging feilet");
          navigate("/login", { replace: true });
        });
    }
  }, [searchParams, navigate, processing]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Logger inn...</p>
      </div>
    </div>
  );
}
