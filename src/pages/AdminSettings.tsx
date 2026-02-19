import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SyncStats {
  synced: number;
  failed: number;
  restored: number;
  not_synced: number;
  cancelled: number;
  missing_in_outlook: number;
}

interface SyncEvent {
  id: string;
  title: string;
  internalNumber: string | null;
  outlookSyncStatus: string;
  outlookLastSyncedAt: string | null;
  microsoftEventId: string | null;
}

export default function AdminSettings() {
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from("events")
        .select("id, title, internal_number, outlook_sync_status, outlook_last_synced_at, microsoft_event_id")
        .order("start_time", { ascending: false });

      if (data) {
        const s: SyncStats = { synced: 0, failed: 0, restored: 0, not_synced: 0, cancelled: 0, missing_in_outlook: 0 };
        const mapped: SyncEvent[] = [];

        for (const e of data) {
          const status = (e as any).outlook_sync_status || "not_synced";
          if (status in s) (s as any)[status]++;
          mapped.push({
            id: e.id,
            title: e.title,
            internalNumber: e.internal_number,
            outlookSyncStatus: status,
            outlookLastSyncedAt: (e as any).outlook_last_synced_at,
            microsoftEventId: e.microsoft_event_id,
          });
        }

        setStats(s);
        setEvents(mapped);
      }
      setLoading(false);
    }
    fetch();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Administrasjon</h1>
        <p className="text-sm text-muted-foreground">Systeminnstillinger og Outlook-synkoversikt</p>
      </div>

      <Tabs defaultValue="sync">
        <TabsList>
          <TabsTrigger value="sync">Outlook Sync</TabsTrigger>
          <TabsTrigger value="settings">Innstillinger</TabsTrigger>
        </TabsList>

        <TabsContent value="sync" className="space-y-4 pt-4">
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <SyncStatCard label="Synced" value={stats.synced} icon={<CheckCircle className="h-4 w-4 text-green-500" />} />
              <SyncStatCard label="Failed" value={stats.failed} icon={<XCircle className="h-4 w-4 text-destructive" />} />
              <SyncStatCard label="Restored" value={stats.restored} icon={<RefreshCw className="h-4 w-4 text-blue-500" />} />
              <SyncStatCard label="Mangler" value={stats.missing_in_outlook} icon={<AlertTriangle className="h-4 w-4 text-orange-500" />} />
              <SyncStatCard label="Ikke synced" value={stats.not_synced} icon={<div className="h-4 w-4 rounded-full bg-muted-foreground/30" />} />
              <SyncStatCard label="Kansellert" value={stats.cancelled} icon={<div className="h-4 w-4 rounded-full bg-muted-foreground/30" />} />
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Alle events med sync-problemer</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const problemEvents = events.filter((e) =>
                  ["failed", "missing_in_outlook", "restored"].includes(e.outlookSyncStatus)
                );
                if (problemEvents.length === 0) {
                  return <p className="text-sm text-muted-foreground">Ingen synkroniseringsproblemer 🎉</p>;
                }
                return (
                  <div className="space-y-2">
                    {problemEvents.map((ev) => (
                      <div key={ev.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                        <StatusIcon status={ev.outlookSyncStatus} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{ev.title}</p>
                          <p className="text-xs text-muted-foreground">{ev.internalNumber || ev.id.slice(0, 8)}</p>
                        </div>
                        <span className="text-xs text-muted-foreground capitalize">{ev.outlookSyncStatus.replace(/_/g, " ")}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="pt-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Systeminnstillinger kommer snart.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SyncStatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-2">
        {icon}
        <div>
          <p className="text-lg font-bold">{value}</p>
          <p className="text-[10px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "failed") return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  if (status === "missing_in_outlook") return <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />;
  if (status === "restored") return <RefreshCw className="h-4 w-4 text-blue-500 shrink-0" />;
  return <div className="h-4 w-4 rounded-full bg-muted-foreground/30 shrink-0" />;
}
