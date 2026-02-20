import { useState, useEffect } from "react";
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
  RefreshCw, ShieldAlert, Inbox, MailOpen,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface EmailComposerProps {
  entityType: "lead" | "job";
  entityId: string;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBodyHtml?: string;
  refCode?: string | null;
  onSent?: () => void;
}

interface StructuredError {
  error_code: string;
  message: string;
  recommendation: string;
  graph_status?: number;
}

interface CommLog {
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

const MODE_CONFIG: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  sent: { label: "Sendt", icon: CheckCircle, className: "text-[hsl(var(--status-approved))]" },
  draft: { label: "Kladd", icon: FileEdit, className: "text-muted-foreground" },
  sending: { label: "Sender...", icon: Loader2, className: "text-primary animate-spin" },
  failed: { label: "Feilet", icon: XCircle, className: "text-destructive" },
  received: { label: "Mottatt", icon: Inbox, className: "text-primary" },
};

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
  const [toList, setToList] = useState<string[]>(defaultTo ? [defaultTo] : [""]);
  const [ccList, setCcList] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject || "");
  const [bodyText, setBodyText] = useState("");
  const [sendNow, setSendNow] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ mode: string; web_link?: string; message?: string } | null>(null);
  const [commLogs, setCommLogs] = useState<CommLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [fetchingThread, setFetchingThread] = useState(false);
  const [expandedPreview, setExpandedPreview] = useState<string | null>(null);

  useEffect(() => {
    if (defaultTo) setToList([defaultTo]);
    if (defaultSubject) setSubject(defaultSubject);
  }, [defaultTo, defaultSubject]);

  const fetchLogs = async () => {
    setLogsLoading(true);
    const { data } = await supabase
      .from("communication_logs")
      .select("id, mode, direction, subject, to_recipients, body_preview, outlook_weblink, created_at, graph_message_id, last_error, ref_code")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(30);
    setCommLogs((data || []) as CommLog[]);
    setLogsLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [entityType, entityId]);

  const buildHtmlBody = () => {
    const userContent = bodyText
      .split("\n")
      .map(line => `<p>${line || "&nbsp;"}</p>`)
      .join("");
    if (defaultBodyHtml) {
      return userContent + "<br/>" + defaultBodyHtml;
    }
    return userContent;
  };

  const handleSend = async () => {
    const validTo = toList.filter(e => e.trim());
    if (validTo.length === 0) { toast.error("Legg til minst én mottaker"); return; }
    if (!subject.trim()) { toast.error("Emne er påkrevd"); return; }

    setSending(true);
    setLastResult(null);
    try {
      const payload = {
        action: sendNow ? "send_mail" : "create_draft",
        entity_type: entityType,
        entity_id: entityId,
        to: validTo,
        cc: ccList.filter(e => e.trim()),
        subject: subject.trim(),
        body_html: buildHtmlBody(),
      };

      const { data, error } = await supabase.functions.invoke("ms-mail", { body: payload });

      if (error) throw error;
      if (data?.ms_reauth) {
        toast.error("Microsoft-tilkobling må fornyes", {
          description: (data.error_info as StructuredError)?.recommendation || "Logg inn på nytt.",
        });
        return;
      }
      if (data?.error) {
        const errInfo = data.error_info as StructuredError | undefined;
        toast.error(data.error, { description: errInfo?.recommendation });
        return;
      }

      if (data?.mode === "already_sent") {
        toast.info("Denne e-posten ble allerede sendt", { description: "Duplikat-sending forhindret." });
        setLastResult({ mode: "sent", web_link: data.web_link, message: "Allerede sendt (duplikat forhindret)" });
        return;
      }

      const modeLabel = data?.mode === "sent" ? "E-post sendt" : "Kladd opprettet i Outlook";
      toast.success(modeLabel);
      setLastResult({ mode: data.mode, web_link: data.web_link });
      fetchLogs();
      onSent?.();
    } catch (err: any) {
      console.error("[EmailComposer] Error:", err);
      toast.error("Feil ved e-postsending");
    } finally {
      setSending(false);
    }
  };

  const handleFetchThread = async () => {
    setFetchingThread(true);
    try {
      const { data, error } = await supabase.functions.invoke("ms-mail", {
        body: { action: "fetch_thread", entity_type: entityType, entity_id: entityId },
      });

      if (error) throw error;
      if (data?.ms_reauth) {
        toast.error("Microsoft-tilkobling må fornyes", {
          description: (data.error_info as StructuredError)?.recommendation || "Logg inn på nytt.",
        });
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      const msgCount = data?.messages?.length || 0;
      const storedCount = data?.stored_count || 0;

      if (msgCount === 0) {
        toast.info("Ingen svar funnet i denne tråden");
      } else {
        toast.success(`Fant ${msgCount} melding(er)${storedCount > 0 ? `, ${storedCount} nye lagret` : ""}`);
      }

      fetchLogs();
    } catch (err: any) {
      console.error("[EmailComposer] Fetch thread error:", err);
      toast.error("Kunne ikke hente svar");
    } finally {
      setFetchingThread(false);
    }
  };

  const handleRetry = async (logEntry: CommLog) => {
    const recipients = Array.isArray(logEntry.to_recipients)
      ? logEntry.to_recipients.map((r: any) => r.address || r)
      : [];
    setToList(recipients.length > 0 ? recipients : [""]);
    setSubject(logEntry.subject || "");
    setSendNow(true);
    toast.info("E-postdata lastet inn – trykk 'Send e-post' for å prøve igjen.");
  };

  const updateListItem = (list: string[], setList: (v: string[]) => void, idx: number, value: string) => {
    const updated = [...list];
    updated[idx] = value;
    setList(updated);
  };

  const removeListItem = (list: string[], setList: (v: string[]) => void, idx: number) => {
    setList(list.filter((_, i) => i !== idx));
  };

  // Separate outbound and inbound for display
  const outboundLogs = commLogs.filter(l => l.direction !== "inbound");
  const inboundLogs = commLogs.filter(l => l.direction === "inbound");
  const hasAnyOutbound = outboundLogs.some(l => l.mode === "sent" || l.mode === "draft");

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
            {/* Preview toggle */}
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
            {log.mode === "failed" && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => handleRetry(log)}>
                <RefreshCw className="h-3 w-3" /> Prøv igjen
              </Button>
            )}
            {log.outlook_weblink && (
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => window.open(log.outlook_weblink!, "_blank")} title="Åpne i Outlook">
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>

        {/* Body preview */}
        {isPreviewExpanded && log.body_preview && (
          <div className="rounded-md bg-muted/50 border p-3 ml-7">
            <p className="text-xs text-foreground whitespace-pre-wrap">{log.body_preview}</p>
          </div>
        )}

        {/* Expanded error details */}
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

  return (
    <div className="space-y-4">
      {/* Compose form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Ny e-post
            {refCode && (
              <Badge variant="outline" className="text-xs font-normal ml-auto">{refCode}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* To */}
          <div className="space-y-1.5">
            <Label className="text-xs">Til</Label>
            {toList.map((email, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={email}
                  onChange={(e) => updateListItem(toList, setToList, idx, e.target.value)}
                  placeholder="e-post@example.com"
                  type="email"
                  className="flex-1"
                  disabled={sending}
                />
                {toList.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeListItem(toList, setToList, idx)} disabled={sending}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setToList([...toList, ""])} disabled={sending}>
              <Plus className="h-3 w-3" /> Legg til mottaker
            </Button>
          </div>

          {/* CC toggle */}
          <button
            type="button"
            onClick={() => setShowCc(!showCc)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {showCc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Cc / Bcc
          </button>

          {showCc && (
            <div className="space-y-1.5">
              <Label className="text-xs">Cc</Label>
              {ccList.map((email, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={email}
                    onChange={(e) => updateListItem(ccList, setCcList, idx, e.target.value)}
                    placeholder="e-post@example.com"
                    type="email"
                    className="flex-1"
                    disabled={sending}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeListItem(ccList, setCcList, idx)} disabled={sending}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setCcList([...ccList, ""])} disabled={sending}>
                <Plus className="h-3 w-3" /> Legg til
              </Button>
            </div>
          )}

          {/* Subject */}
          <div className="space-y-1.5">
            <Label className="text-xs">Emne</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Emne..." disabled={sending} />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label className="text-xs">Melding</Label>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={5}
              placeholder="Skriv meldingen din her..."
              disabled={sending}
            />
            {defaultBodyHtml && (
              <p className="text-xs text-muted-foreground">Firmainformasjon legges til automatisk.</p>
            )}
          </div>

          {/* Send mode toggle */}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex items-center gap-2">
              <Switch checked={sendNow} onCheckedChange={setSendNow} id="send-mode" disabled={sending} />
              <Label htmlFor="send-mode" className="text-sm cursor-pointer">
                {sendNow ? "Send nå" : "Lagre kladd"}
              </Label>
            </div>
            <Badge variant="outline" className="text-xs">
              {sendNow ? "Sendes direkte fra Outlook" : "Lagres som kladd i Outlook"}
            </Badge>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSend} disabled={sending} className="gap-1.5">
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : sendNow ? (
                <Send className="h-4 w-4" />
              ) : (
                <FileEdit className="h-4 w-4" />
              )}
              {sending
                ? (sendNow ? "Sender..." : "Oppretter...")
                : (sendNow ? "Send e-post" : "Opprett kladd")
              }
            </Button>
          </div>

          {/* Result */}
          {lastResult && (
            <div className="flex items-center gap-2 p-3 rounded-lg border bg-secondary/50">
              <CheckCircle className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm flex-1">
                {lastResult.message || (lastResult.mode === "sent" ? "E-post sendt!" : "Kladd opprettet i Outlook")}
              </span>
              {lastResult.web_link && (
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => window.open(lastResult.web_link, "_blank")}>
                  <ExternalLink className="h-3 w-3" /> Åpne i Outlook
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Thread / History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">E-posttråd</CardTitle>
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
          {logsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : commLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Ingen e-poster ennå</p>
          ) : (
            <div className="space-y-2">
              {commLogs.map(renderLogEntry)}
            </div>
          )}

          {!logsLoading && commLogs.length > 0 && inboundLogs.length === 0 && hasAnyOutbound && (
            <p className="text-xs text-muted-foreground text-center mt-3 py-2 border-t">
              Ingen innkommende svar funnet. Trykk «Hent siste svar» for å søke.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
