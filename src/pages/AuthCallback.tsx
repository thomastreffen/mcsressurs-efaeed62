import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const processingRef = useRef(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    console.log("[AuthCallback] mounted", { code: !!code, error, hasOpener: !!window.opener, origin: window.location.origin });

    if (window.opener) {
      console.log("[AuthCallback] In popup, posting message to opener");
      if (code) {
        window.opener.postMessage({ type: "microsoft-auth-code", code }, "*");
      } else if (error) {
        window.opener.postMessage({ type: "microsoft-auth-error", error }, "*");
      }
      window.close();
      return;
    }

    // Not in a popup — handle code directly (redirect flow)
    if (error) {
      console.error("[AuthCallback] Auth error:", error);
      toast.error("Innlogging feilet", { description: error });
      navigate("/login", { replace: true });
      return;
    }

    if (!code) {
      console.warn("[AuthCallback] No code in URL");
      navigate("/login", { replace: true });
      return;
    }

    if (processingRef.current) {
      console.log("[AuthCallback] Already processing, skipping");
      return;
    }
    processingRef.current = true;

    const redirectUri = `${window.location.origin}/auth/callback`;
    console.log("[AuthCallback] Exchanging code, redirectUri:", redirectUri);

    const timeout = setTimeout(() => {
      console.error("[AuthCallback] Exchange timed out");
      toast.error("Innlogging tok for lang tid");
      navigate("/login", { replace: true });
    }, 15000);

    supabase.functions
      .invoke("auth-callback", {
        body: { code, redirect_uri: redirectUri },
      })
      .then(async ({ data, error: fnError }) => {
        clearTimeout(timeout);
        console.log("[AuthCallback] Edge function response:", { data: !!data, error: fnError });

        if (fnError || !data?.session) {
          console.error("[AuthCallback] Login failed:", data?.error || fnError);
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
        console.error("[AuthCallback] Exception:", err);
        toast.error("Innlogging feilet");
        navigate("/login", { replace: true });
      });
  }, [searchParams, navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Logger inn...</p>
      </div>
    </div>
  );
}
