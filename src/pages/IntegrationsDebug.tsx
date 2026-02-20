import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Plug,
} from "lucide-react";

const AZURE_CLIENT_ID = "f5605c08-b986-4626-9dec-e1446fd13702";
const AZURE_TENANT_ID = "e1b96c2a-c273-40b9-bb46-a2a7b570e133";
const EXPECTED_SCOPES = "openid profile email User.Read Calendars.ReadWrite User.Read.All Mail.ReadWrite offline_access";

type TestResult = { status: number; ok: boolean; error?: string; data?: string };

export default function IntegrationsDebug() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [tests, setTests] = useState<Record<string, TestResult> | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const redirectUri = `${window.location.origin}/auth/callback`;
  const callbackUrl = redirectUri;

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toISOString().slice(11, 23);
    setLogs((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    addLog("Henter Microsoft 365-status...");
    try {
      const { data, error } = await supabase.functions.invoke("ms-debug", {
        body: { action: "status" },
      });
      if (error) throw error;
      setStatus(data);
      if (data.logs) data.logs.forEach((l: string) => addLog(l));
      addLog(`Status hentet. Tilkoblet: ${data.ms_connected}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`FEIL: ${msg}`);
      toast.error("Kunne ikke hente status");
    } finally {
      setLoading(false);
    }
  };

  const runTests = async () => {
    setTesting(true);
    addLog("Kjører Graph API-tester...");
    try {
      const { data, error } = await supabase.functions.invoke("ms-debug", {
        body: { action: "test" },
      });
      if (error) throw error;
      setTests(data.tests || {});
      if (data.logs) data.logs.forEach((l: string) => addLog(l));
      if (data.ms_reauth) {
        addLog("⚠️ Re-autentisering påkrevd.");
        toast.warning("Microsoft-tilkobling må fornyes");
      } else {
        addLog("Tester fullført.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`FEIL: ${msg}`);
      toast.error("Test feilet");
    } finally {
      setTesting(false);
    }
  };

  const handleDebugConnect = () => {
    addLog("Starter Microsoft 365 OAuth debug-flyt...");
    addLog(`Redirect URI: ${redirectUri}`);
    addLog(`Scopes: ${EXPECTED_SCOPES}`);
    addLog(`Tenant: ${AZURE_TENANT_ID}`);

    const scope = encodeURIComponent(EXPECTED_SCOPES);
    const authUrl =
      `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/authorize` +
      `?client_id=${AZURE_CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scope}` +
      `&response_mode=query` +
      `&prompt=consent`;

    addLog(`Authorize URL generert. Redirect starter...`);
    window.location.href = authUrl;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Kopiert til utklippstavle");
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrasjoner</h1>
        <p className="text-sm text-muted-foreground">
          Microsoft 365 – Status og feilsøking
        </p>
      </div>

      {/* Redirect URI Warning */}
      <Card className="border-status-requested/30 bg-status-requested/5">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-[hsl(var(--status-requested))] mt-0.5 shrink-0" />
            <div className="space-y-2 flex-1">
              <p className="text-sm font-medium text-foreground">
                Hvis du ikke blir sendt tilbake hit etter innlogging, er Redirect URI feil.
              </p>
              <p className="text-xs text-muted-foreground">
                Kopier denne og legg til i Entra App Registration → Authentication → Redirect URIs:
              </p>
              <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
                <code className="text-xs text-foreground flex-1 break-all">{redirectUri}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => copyToClipboard(redirectUri)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleDebugConnect} className="gap-2">
          <Plug className="h-4 w-4" />
          Koble til Microsoft 365 (Debug)
        </Button>
        <Button variant="outline" onClick={fetchStatus} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Hent status
        </Button>
        <Button variant="outline" onClick={runTests} disabled={testing} className="gap-2">
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          Test callback og token
        </Button>
      </div>

      {/* Status Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Statuspanel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusRow
            label="Innlogget bruker"
            value={session?.user?.email || "Ikke innlogget"}
            sublabel={session?.user?.id?.slice(0, 8) + "..."}
          />
          <Separator />
          <StatusRow
            label="Microsoft-tilkobling"
            value={status ? (status.ms_connected ? "Tilkoblet" : "Ikke tilkoblet") : "Ukjent"}
            badge={status?.ms_connected ? "success" : status ? "error" : "neutral"}
          />
          <StatusRow
            label="Refresh token"
            value={status ? (status.ms_refresh_available ? "Finnes" : "Mangler") : "Ukjent"}
            badge={status?.ms_refresh_available ? "success" : status ? "warning" : "neutral"}
          />
          <StatusRow
            label="Token utløper"
            value={status?.ms_expires_at ? String(status.ms_expires_at) : "N/A"}
            badge={status?.ms_expired === false ? "success" : status?.ms_expired === true ? "error" : "neutral"}
            sublabel={status?.ms_expired === true ? "Utløpt" : status?.ms_expired === false ? "Gyldig" : undefined}
          />
          <Separator />
          <StatusRow label="Forventede scopes" value={EXPECTED_SCOPES} mono />
          <StatusRow label="Redirect URI" value={redirectUri} mono />
          <StatusRow label="Callback URL" value={callbackUrl} mono />
          <StatusRow label="Tenant ID" value={status?.tenant_id ? String(status.tenant_id) : AZURE_TENANT_ID} mono />
        </CardContent>
      </Card>

      {/* Test Results */}
      {tests && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Graph API-tester</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(tests).map(([endpoint, result]) => (
              <div key={endpoint} className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                {result.ok ? (
                  <CheckCircle2 className="h-5 w-5 text-[hsl(var(--status-approved))] mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{endpoint}</span>
                    <Badge variant={result.ok ? "default" : "destructive"} className="text-xs">
                      {result.status}
                    </Badge>
                  </div>
                  {result.data && (
                    <p className="text-xs text-muted-foreground mt-1">{result.data}</p>
                  )}
                  {result.error && (
                    <p className="text-xs text-destructive mt-1 break-all">{result.error}</p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Debug Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Debug-logg (siste 50)</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64 rounded-md border bg-muted/30 p-3">
            {logs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Ingen logger ennå. Trykk "Hent status" for å starte.
              </p>
            ) : (
              <div className="space-y-1">
                {logs.map((line, i) => (
                  <p key={i} className="text-xs font-mono text-foreground whitespace-pre-wrap">
                    {line}
                  </p>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({
  label,
  value,
  sublabel,
  badge,
  mono,
}: {
  label: string;
  value: string;
  sublabel?: string;
  badge?: "success" | "error" | "warning" | "neutral";
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <span className="text-sm text-muted-foreground w-40 shrink-0">{label}</span>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {badge && badge !== "neutral" && (
          <div
            className={`h-2 w-2 rounded-full shrink-0 ${
              badge === "success"
                ? "bg-[hsl(var(--status-approved))]"
                : badge === "error"
                ? "bg-destructive"
                : "bg-[hsl(var(--status-requested))]"
            }`}
          />
        )}
        <span
          className={`text-sm text-foreground ${mono ? "font-mono text-xs break-all" : ""}`}
        >
          {value}
        </span>
        {sublabel && (
          <span className="text-xs text-muted-foreground">({sublabel})</span>
        )}
      </div>
    </div>
  );
}
