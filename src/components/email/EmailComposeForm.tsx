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
  Plus, Trash2, ChevronDown, ChevronUp, CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { StructuredError } from "@/components/EmailComposer";

interface EmailComposeFormProps {
  entityType: "lead" | "job";
  entityId: string;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBodyHtml?: string;
  refCode?: string | null;
  onSent?: () => void;
}

export function EmailComposeForm({
  entityType,
  entityId,
  defaultTo,
  defaultSubject,
  defaultBodyHtml,
  refCode,
  onSent,
}: EmailComposeFormProps) {
  const { user } = useAuth();
  const [toList, setToList] = useState<string[]>(defaultTo ? [defaultTo] : [""]);
  const [ccList, setCcList] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject || "");
  const [bodyText, setBodyText] = useState("");
  const [sendNow, setSendNow] = useState(entityType === "lead");
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ mode: string; web_link?: string; message?: string } | null>(null);

  useEffect(() => {
    if (defaultTo) setToList([defaultTo]);
    if (defaultSubject) setSubject(defaultSubject);
  }, [defaultTo, defaultSubject]);

  const buildHtmlBody = () => {
    const userContent = bodyText.split("\n").map(line => `<p>${line || "&nbsp;"}</p>`).join("");
    return defaultBodyHtml ? userContent + "<br/>" + defaultBodyHtml : userContent;
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
      onSent?.();
    } catch (err: any) {
      console.error("[EmailComposeForm] Error:", err);
      toast.error("Feil ved e-postsending");
    } finally {
      setSending(false);
    }
  };

  const updateListItem = (list: string[], setList: (v: string[]) => void, idx: number, value: string) => {
    const updated = [...list];
    updated[idx] = value;
    setList(updated);
  };

  const removeListItem = (list: string[], setList: (v: string[]) => void, idx: number) => {
    setList(list.filter((_, i) => i !== idx));
  };

  return (
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
  );
}
