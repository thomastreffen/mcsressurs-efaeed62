import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink, ChevronDown, ChevronUp, RefreshCw, ShieldAlert,
  MailOpen, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import type { CommLog, StructuredError } from "@/components/EmailComposer";
import { MODE_CONFIG } from "@/components/EmailComposer";

interface EmailThreadListProps {
  commLogs: CommLog[];
  logsLoading: boolean;
  hasAnyOutbound: boolean;
  inboundCount: number;
}

export function EmailThreadList({ commLogs, logsLoading, hasAnyOutbound, inboundCount }: EmailThreadListProps) {
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [expandedPreview, setExpandedPreview] = useState<string | null>(null);

  const renderLogEntry = (log: CommLog) => {
    const isInbound = log.direction === "inbound";
    const recipients = Array.isArray(log.to_recipients)
      ? log.to_recipients.map((r: any) => r.address || r).join(", ")
      : "";
    const config = MODE_CONFIG[log.mode] || MODE_CONFIG.draft;
    const StatusIcon = config.icon;
    const parsedErr: StructuredError | null = log.mode === "failed" && log.last_error
      ? (typeof log.last_error === "string" ? JSON.parse(log.last_error) : log.last_error)
      : null;
    const isExpanded = expandedError === log.id;
    const isPreviewExpanded = expandedPreview === log.id;

    return (
      <div key={log.id} className="space-y-1">
        <div className={`flex items-start gap-3 rounded-lg border p-3 ${isInbound ? "border-primary/20 bg-primary/5" : ""}`}>
          <StatusIcon className={`h-4 w-4 mt-0.5 shrink-0 ${config.className}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {isInbound && <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Innkommende</Badge>}
              <p className="text-sm font-medium truncate">{log.subject}</p>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {isInbound ? `Fra: ${recipients}` : `Til: ${recipients}`}
            </p>
            {log.body_preview && (
              <button
                type="button"
                onClick={() => setExpandedPreview(isPreviewExpanded ? null : log.id)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"
              >
                <MailOpen className="h-3 w-3" />
                {isPreviewExpanded ? "Skjul forhåndsvisning" : "Vis forhåndsvisning"}
              </button>
            )}
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <p className="text-xs text-muted-foreground">
                {format(new Date(log.created_at), "d. MMM yyyy HH:mm", { locale: nb })}
              </p>
              <Badge variant="outline" className={`text-[10px] ${log.mode === "failed" ? "border-destructive/30 text-destructive" : ""}`}>
                {config.label}
              </Badge>
              {log.ref_code && (
                <Badge variant="secondary" className="text-[10px]">{log.ref_code}</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {parsedErr && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => setExpandedError(isExpanded ? null : log.id)}>
                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Detaljer
              </Button>
            )}
            {log.outlook_weblink && (
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => window.open(log.outlook_weblink!, "_blank")} title="Åpne i Outlook">
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>

        {isPreviewExpanded && log.body_preview && (
          <div className="rounded-md bg-muted/50 border p-3 ml-7">
            <p className="text-xs text-foreground whitespace-pre-wrap">{log.body_preview}</p>
          </div>
        )}

        {isExpanded && parsedErr && (
          <div className="rounded-md bg-destructive/5 border border-destructive/20 p-3 ml-7 space-y-1">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0" />
              <p className="text-xs font-medium text-destructive">{parsedErr.message}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Kode:</span> {parsedErr.error_code}
              {parsedErr.graph_status && <> · <span className="font-medium">HTTP:</span> {parsedErr.graph_status}</>}
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Anbefaling:</span> {parsedErr.recommendation}
            </p>
          </div>
        )}
      </div>
    );
  };

  if (logsLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (commLogs.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Ingen e-poster ennå</p>;
  }

  return (
    <div className="space-y-2">
      {commLogs.map(renderLogEntry)}

      {commLogs.length > 0 && inboundCount === 0 && hasAnyOutbound && (
        <p className="text-xs text-muted-foreground text-center mt-3 py-2 border-t">
          Ingen innkommende svar funnet. Trykk «Hent siste svar» for å søke.
        </p>
      )}
    </div>
  );
}
