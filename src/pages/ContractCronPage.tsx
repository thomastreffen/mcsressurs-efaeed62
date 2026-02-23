import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  ArrowLeft, RefreshCw, Play, FlaskConical, Loader2,
  CheckCircle2, XCircle, Clock, Bell, CalendarDays, AlertTriangle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";

interface CronRun {
  id: string;
  ran_at: string;
  status: string;
  created_alerts_count: number;
  scanned_deadlines_count: number;
  notified_users_count: number;
  error_code: string | null;
  error_message: string | null;
  dry_run: boolean;
}

export default function ContractCronPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);

  const { data: runs, isLoading } = useQuery({
    queryKey: ["contract-cron-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_cron_runs" as any)
        .select("*")
        .order("ran_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as unknown as CronRun[];
    },
  });

  const triggerCron = useCallback(async (dryRun: boolean) => {
    if (dryRun) setDryRunning(true);
    else setRunning(true);

    try {
      const { data, error } = await supabase.functions.invoke("contract-alerts-cron", {
        body: { dry_run: dryRun },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ["contract-cron-runs"] });
      toast.success(
        dryRun ? "Dry-run fullført" : "Cron-jobb fullført",
        {
          description: `${data.scanned_deadlines} frister skannet, ${data.alerts_created} varsler${dryRun ? " (ville blitt)" : ""} opprettet, ${data.notified_users || 0} brukere varslet.`,
        }
      );
    } catch (err: any) {
      toast.error("Cron-jobb feilet", { description: err.message });
    } finally {
      setRunning(false);
      setDryRunning(false);
    }
  }, [queryClient]);

  const lastRun = runs?.[0];
  const lastSuccess = runs?.find(r => r.status === "ok" && !r.dry_run);

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Tilbake
      </Button>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Kontraktvarsler – Cron</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overvåk og styr den daglige varselgenereringen for kontraktfrister.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => triggerCron(true)}
            disabled={dryRunning || running}
            className="gap-1.5"
          >
            {dryRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Dry-run
          </Button>
          <Button
            onClick={() => triggerCron(false)}
            disabled={running || dryRunning}
            className="gap-1.5"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Kjør nå
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Sist kjørt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-semibold">
              {lastSuccess ? format(new Date(lastSuccess.ran_at), "d. MMM HH:mm", { locale: nb }) : "Aldri"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
              {lastRun?.status === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
              Siste status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={lastRun?.status === "ok" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-destructive/10 text-destructive"}>
              {lastRun?.status || "Ukjent"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" /> Varsler opprettet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-semibold">{lastSuccess?.created_alerts_count ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> Frister skannet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-semibold">{lastSuccess?.scanned_deadlines_count ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Run history */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Kjørehistorikk</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["contract-cron-runs"] })}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Oppdater
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Laster...</p>
          ) : !runs || runs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Ingen kjøringer registrert ennå.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tidspunkt</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Frister</TableHead>
                    <TableHead className="hidden sm:table-cell">Varsler</TableHead>
                    <TableHead className="hidden md:table-cell">Notif.</TableHead>
                    <TableHead className="hidden lg:table-cell">Feil</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="text-sm">
                        {format(new Date(run.ran_at), "d. MMM HH:mm:ss", { locale: nb })}
                        {run.dry_run && (
                          <Badge variant="outline" className="ml-1.5 text-[9px]">Dry-run</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={run.status === "ok" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-destructive/10 text-destructive"}>
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">{run.scanned_deadlines_count}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">{run.created_alerts_count}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm">{run.notified_users_count}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {run.error_code ? (
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 text-destructive" />
                            {run.error_code}: {run.error_message?.substring(0, 60)}
                          </span>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
