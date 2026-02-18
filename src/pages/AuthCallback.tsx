import { useEffect, useRef } from "react";
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

    console.log("[AuthCallback] mounted", { code: !!code, error });

    // Popup flow (if applicable)
    if (window.opener) {
      if (code) {
        window.opener.postMessage({ type: "microsoft-auth-code", code }, "*");
      } else if (error) {
        window.opener.postMessage({ type: "microsoft-auth-error", error }, "*");
      }
      window.close();
      return;
    }

    if (error) {
      console.error("[AuthCallback] Auth error:", error);
      toast.error("Innlogging feilet", { description: error });
      navigate("/login", { replace: true });
      return;
    }

    if (!code) {
      navigate("/login", { replace: true });
      return;
    }

    if (processingRef.current) return;
    processingRef.current = true;

    const redirectUri = `${window.location.origin}/auth/callback`;

    supabase.functions
      .invoke("auth-callback", {
        body: { code, redirect_uri: redirectUri },
      })
      .then(async ({ data, error: fnError }) => {
        console.log("[AuthCallback] Response:", { data: !!data, error: fnError });

        if (fnError || !data?.session) {
          console.error("[AuthCallback] Failed:", data?.error || fnError);
          toast.error("Innlogging feilet", {
            description: data?.error || fnError?.message || "Kunne ikke logge inn.",
          });
          navigate("/login", { replace: true });
          return;
        }

        // Set session and redirect immediately — don't wait for role
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        toast.success("Innlogget", {
          description: `Velkommen, ${data.user?.name || ""}!`,
        });
        navigate("/", { replace: true });
      })
      .catch((err) => {
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
