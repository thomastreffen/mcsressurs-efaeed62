import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Mail, Send, FileEdit, Loader2, ExternalLink,
  Plus, Trash2, ChevronDown, ChevronUp, CheckCircle, XCircle,
  RefreshCw, ShieldAlert, Inbox, MailOpen, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

// ── Sub-components ──
import { EmailComposeForm } from "@/components/email/EmailComposeForm";
import { EmailThreadList } from "@/components/email/EmailThreadList";

interface EmailComposerProps {
  entityType: "lead" | "job";
  entityId: string;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBodyHtml?: string;
  refCode?: string | null;
  onSent?: () => void;
}

export interface StructuredError {
  error_code: string;
  message: string;
  recommendation: string;
  graph_status?: number;
}

export interface CommLog {
  id: string;
  mode: string;
  direction: string;
  subject: string;
  to_recipients: any;
  body_preview: string | null;
  outlook_weblink: string | null;
  created_at: string;
  graph_message_id: string | null;
  last_error: any;
  ref_code: string | null;
}

export const MODE_CONFIG: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  sent: { label: "Sendt", icon: CheckCircle, className: "text-[hsl(var(--status-approved))]" },
  draft: { label: "Kladd", icon: FileEdit, className: "text-muted-foreground" },
  sending: { label: "Sender...", icon: Loader2, className: "text-primary animate-spin" },
  failed: { label: "Feilet", icon: XCircle, className: "text-destructive" },
  received: { label: "Mottatt", icon: Inbox, className: "text-primary" },
};

const AUTO_FETCH_STALE_MS = 10 * 60 * 1000; // 10 minutes

export function EmailComposer({
  entityType,
  entityId,
  defaultTo,
  defaultSubject,
  defaultBodyHtml,
  refCode,
  onSent,
}: EmailComposerProps) {
  const { user } = useAuth();
  const [commLogs, setCommLogs] = useState<CommLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [fetchingThread, setFetchingThread] = useState(false);
  const [lastFetchAt, setLastFetchAt] = useState<string | null>(null);
  const [autoFetchFailed, setAutoFetchFailed] = useState(false);
  const autoFetchDone = useRef(false);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    const { data } = await supabase
      .from("communication_logs")
      .select("id, mode, direction, subject, to_recipients, body_preview, outlook_weblink, created_at, graph_message_id, last_error, ref_code")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .neq("mode", "thread_fetch_marker")
      .order("created_at", { ascending: false })
      .limit(30);
    setCommLogs((data || []) as CommLog[]);
    setLogsLoading(false);
    return data || [];
  }, [entityType, entityId]);

  // Load logs + check for last fetch marker
  useEffect(() => {
    const init = async () => {
      await fetchLogs();
      // Check last fetch marker
      const { data: marker } = await supabase
        .from("communication_logs")
        .select("updated_at")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("mode", "thread_fetch_marker")
        .limit(1)
        .single();
      if (marker?.updated_at) {
        setLastFetchAt(marker.updated_at);
      }
    };
    init();
  }, [entityType, entityId, fetchLogs]);

  const handleFetchThread = useCallback(async () => {
    setFetchingThread(true);
    setAutoFetchFailed(false);
    try {
      const { data, error } = await supabase.functions.invoke("ms-mail", {
        body: { action: "fetch_thread", entity_type: entityType, entity_id: entityId },
      });

      if (error) throw error;
      if (data?.ms_reauth) {
        toast.error("Microsoft-tilkobling må fornyes", {
          description: (data.error_info as StructuredError)?.recommendation || "Logg inn på nytt.",
        });
        return false;
      }
      if (data?.error) {
        toast.error(data.error);
        return false;
      }

      if (data?.throttled) {
        setLastFetchAt(data.last_fetch_at);
        // Silently use cached data
      } else {
        const msgCount = data?.messages?.length || 0;
        const storedCount = data?.stored_count || 0;
        setLastFetchAt(data?.last_fetch_at || new Date().toISOString());

        if (msgCount === 0) {
          toast.info("Ingen svar funnet i denne tråden");
        } else if (storedCount > 0) {
          toast.success(`Fant ${msgCount} melding(er), ${storedCount} nye lagret`);
        }
      }

      await fetchLogs();
      return true;
    } catch (err: any) {
      console.error("[EmailComposer] Fetch thread error:", err);
      setAutoFetchFailed(true);
      return false;
    } finally {
      setFetchingThread(false);
    }
  }, [entityType, entityId, fetchLogs]);

  // Auto-fetch on mount if stale
  useEffect(() => {
    if (autoFetchDone.current) return;
    autoFetchDone.current = true;

    const hasOutbound = commLogs.some(l => l.direction !== "inbound" && (l.mode === "sent" || l.mode === "draft"));
    if (!hasOutbound) return;

    const isStale = !lastFetchAt || (Date.now() - new Date(lastFetchAt).getTime()) > AUTO_FETCH_STALE_MS;
    if (isStale) {
      handleFetchThread();
    }
  }, [commLogs, lastFetchAt, handleFetchThread]);

  const hasAnyOutbound = commLogs.some(l => l.direction !== "inbound" && (l.mode === "sent" || l.mode === "draft"));
  const inboundLogs = commLogs.filter(l => l.direction === "inbound");

  return (
    <div className="space-y-4">
      {/* Compose form */}
      <EmailComposeForm
        entityType={entityType}
        entityId={entityId}
        defaultTo={defaultTo}
        defaultSubject={defaultSubject}
        defaultBodyHtml={defaultBodyHtml}
        refCode={refCode}
        onSent={() => {
          fetchLogs();
          onSent?.();
        }}
      />

      {/* Thread / History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">E-posttråd</CardTitle>
              {lastFetchAt && !fetchingThread && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Oppdatert {formatDistanceToNow(new Date(lastFetchAt), { addSuffix: true, locale: nb })}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={handleFetchThread}
              disabled={fetchingThread || !hasAnyOutbound}
              title={!hasAnyOutbound ? "Send en e-post først for å kunne hente svar" : ""}
            >
              {fetchingThread ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Inbox className="h-3.5 w-3.5" />
              )}
              {fetchingThread ? "Henter..." : "Hent siste svar"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {autoFetchFailed && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20 mb-3">
              <XCircle className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-xs text-destructive flex-1">Kunne ikke hente svar automatisk.</span>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleFetchThread} disabled={fetchingThread}>
                <RefreshCw className="h-3 w-3" /> Prøv igjen
              </Button>
            </div>
          )}

          <EmailThreadList
            commLogs={commLogs}
            logsLoading={logsLoading}
            hasAnyOutbound={hasAnyOutbound}
            inboundCount={inboundLogs.length}
          />
        </CardContent>
      </Card>
    </div>
  );
}
