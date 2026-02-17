import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Wrench, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const AZURE_CLIENT_ID = "f5605c08-b986-4626-9dec-e1446fd13702";
const AZURE_TENANT_ID = "e1b96c2a-c273-40b9-bb46-a2a7b570e133";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, loading: authLoading } = useAuth();
  const [processing, setProcessing] = useState(false);

  const redirectUri = `${window.location.origin}/login`;

  // If already logged in, redirect
  useEffect(() => {
    if (!authLoading && session) {
      navigate("/", { replace: true });
    }
  }, [session, authLoading, navigate]);

  // Handle callback with authorization code
  useEffect(() => {
    const code = searchParams.get("code");
    if (!code || processing) return;

    setProcessing(true);

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("auth-callback", {
          body: { code, redirect_uri: redirectUri },
        });

        if (error || !data?.session) {
          toast.error("Innlogging feilet", {
            description: data?.error || error?.message || "Kunne ikke logge inn.",
          });
          setProcessing(false);
          // Clear code from URL
          navigate("/login", { replace: true });
          return;
        }

        // Set the session in the Supabase client
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        toast.success("Innlogget", {
          description: `Velkommen, ${data.user.name}!`,
        });
        navigate("/", { replace: true });
      } catch (err) {
        console.error("Login error:", err);
        toast.error("Innlogging feilet");
        setProcessing(false);
        navigate("/login", { replace: true });
      }
    })();
  }, [searchParams, processing, navigate, redirectUri]);

  const handleLogin = () => {
    const scope = encodeURIComponent(
      "openid profile email User.Read Calendars.ReadWrite User.Read.All offline_access"
    );
    const authUrl =
      `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/authorize` +
      `?client_id=${AZURE_CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scope}` +
      `&response_mode=query`;

    window.location.href = authUrl;
  };

  if (authLoading || processing) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {processing ? "Logger inn..." : "Laster..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 rounded-xl border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Wrench className="h-6 w-6" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-card-foreground">MCS Service</h1>
            <p className="text-sm text-muted-foreground">Ressursplanlegger</p>
          </div>
        </div>

        <Button onClick={handleLogin} className="w-full gap-2" size="lg">
          <svg viewBox="0 0 21 21" className="h-5 w-5" fill="none">
            <rect x="1" y="1" width="9" height="9" fill="hsl(var(--destructive))" />
            <rect x="11" y="1" width="9" height="9" fill="hsl(var(--status-accepted))" />
            <rect x="1" y="11" width="9" height="9" fill="hsl(var(--primary))" />
            <rect x="11" y="11" width="9" height="9" fill="hsl(var(--status-pending))" />
          </svg>
          Logg inn med Microsoft
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Kun tilgjengelig for ansatte i organisasjonen.
        </p>
      </div>
    </div>
  );
}
