import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (window.opener) {
      // We're in a popup — send code back to parent
      if (code) {
        window.opener.postMessage({ type: "microsoft-auth-code", code }, window.location.origin);
      } else if (error) {
        window.opener.postMessage({ type: "microsoft-auth-error", error }, window.location.origin);
      }
      window.close();
    }
    // If not in a popup, Login.tsx handles the code via searchParams
  }, [searchParams]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Logger inn...</p>
      </div>
    </div>
  );
}
