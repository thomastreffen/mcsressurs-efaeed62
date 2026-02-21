import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Database, Cloud, Brain, Zap,
  RefreshCw, CheckCircle2, AlertTriangle, XCircle, Loader2, ArrowLeft,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface CheckResult {
  service: string;
  status: "ok" | "warn" | "fail";
  latency_ms: number;
  message: string;
  error_code?: string;
}

const SERVICE_META: Record<string, { label: string; icon: React.ElementType; action: string }> = {
  database: { label: "Database", icon: Database, action: "db_check" },
  microsoft_graph: { label: "Microsoft Graph", icon: Cloud, action: "graph_check" },
  ai_gateway: { label: "AI Gateway", icon: Brain, action: "ai_check" },
  edge_functions: { label: "Edge Functions", icon: Zap, action: "edge_check" },
};

const STATUS_CONFIG = {
  ok: { label: "OK", variant: "default" as const, icon: CheckCircle2, className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  warn: { label: "Advarsel", variant: "secondary" as const, icon: AlertTriangle, className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  fail: { label: "Feil", variant: "destructive" as const, icon: XCircle, className: "bg-destructive/10 text-destructive" },
};

export default function SystemHealthPage() {
  const navigate = useNavigate();
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [globalLoading, setGlobalLoading] = useState(false);

  const runCheck = useCallback(async (action?: string) => {
    const key = action || "all";
    if (action) {
      setLoading(prev => ({ ...prev, [action]: true }));
    } else {
      setGlobalLoading(true);
    }

    try {
      const { data, error } = await supabase.functions.invoke("system-health", {
        body: { action: action || "all" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const newResults: Record<string, CheckResult> = {};
      for (const r of data.results) {
        newResults[r.service] = r;
      }

      setResults(prev => ({ ...prev, ...newResults }));
      setCheckedAt(data.checked_at);
    } catch (err: any) {
      console.error("Health check failed:", err);
      // If a specific check failed, mark it
      if (action) {
        const service = Object.entries(SERVICE_META).find(([, m]) => m.action === action)?.[0];
        if (service) {
          setResults(prev => ({
            ...prev,
            [service]: {
              service,
              status: "fail",
              latency_ms: 0,
              message: err.message || "Kunne ikke utføre sjekk",
              error_code: "check_failed",
            },
          }));
        }
      }
    } finally {
      if (action) {
        setLoading(prev => ({ ...prev, [action]: false }));
      } else {
        setGlobalLoading(false);
      }
    }
  }, []);

  const overallStatus = Object.values(results).length === 0
    ? null
    : Object.values(results).some(r => r.status === "fail")
      ? "fail"
      : Object.values(results).some(r => r.status === "warn")
        ? "warn"
        : "ok";

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Tilbake
      </Button>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Systemhelse</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overvåk tilstanden til kritiske tjenester
          </p>
        </div>
        <div className="flex items-center gap-3">
          {checkedAt && (
            <span className="text-xs text-muted-foreground">
              Sist sjekket: {format(new Date(checkedAt), "HH:mm:ss", { locale: nb })}
            </span>
          )}
          <Button onClick={() => runCheck()} disabled={globalLoading} className="gap-1.5">
            {globalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Test alle
          </Button>
        </div>
      </div>

      {overallStatus && (
        <div className={`rounded-lg border p-3 flex items-center gap-3 ${
          overallStatus === "ok" ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950" :
          overallStatus === "warn" ? "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950" :
          "border-destructive/30 bg-destructive/5"
        }`}>
          {overallStatus === "ok" && <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />}
          {overallStatus === "warn" && <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />}
          {overallStatus === "fail" && <XCircle className="h-5 w-5 text-destructive" />}
          <span className="text-sm font-medium">
            {overallStatus === "ok" && "Alle tjenester fungerer normalt"}
            {overallStatus === "warn" && "Noen tjenester har advarsler"}
            {overallStatus === "fail" && "En eller flere tjenester har feil"}
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {Object.entries(SERVICE_META).map(([key, meta]) => {
          const result = results[key];
          const isLoading = loading[meta.action] || globalLoading;
          const Icon = meta.icon;
          const statusConfig = result ? STATUS_CONFIG[result.status] : null;
          const StatusIcon = statusConfig?.icon;

          return (
            <Card key={key} className="transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                    <Icon className="h-4.5 w-4.5 text-secondary-foreground" />
                  </div>
                  <CardTitle className="text-base font-semibold">{meta.label}</CardTitle>
                </div>
                {statusConfig && (
                  <Badge className={`${statusConfig.className} gap-1 text-xs`}>
                    {StatusIcon && <StatusIcon className="h-3 w-3" />}
                    {statusConfig.label}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {!result && !isLoading && (
                  <p className="text-sm text-muted-foreground">Ikke sjekket ennå. Trykk «Test nå» for å starte.</p>
                )}
                {isLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sjekker...
                  </div>
                )}
                {result && !isLoading && (
                  <div className="space-y-2">
                    <p className="text-sm text-foreground">{result.message}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Responstid: {result.latency_ms}ms</span>
                      {result.error_code && (
                        <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{result.error_code}</span>
                      )}
                    </div>
                    {result.status === "fail" && (
                      <p className="text-xs text-muted-foreground italic">
                        {key === "microsoft_graph" && "Anbefaling: Gå til Integrasjoner og koble Microsoft til på nytt."}
                        {key === "ai_gateway" && "Anbefaling: Sjekk AI-kreditter eller vent ved overbelastning."}
                        {key === "database" && "Anbefaling: Kontakt systemadministrator."}
                        {key === "edge_functions" && "Anbefaling: Sjekk deploy-status for berørte funksjoner."}
                      </p>
                    )}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runCheck(meta.action)}
                  disabled={isLoading}
                  className="gap-1.5"
                >
                  {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Test nå
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
