import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Mail, Send, FileEdit, Loader2, ExternalLink,
  Plus, Trash2, ChevronDown, ChevronUp, CheckCircle,
  Paperclip, X, FileText, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { SuccessCheckmark } from "@/components/SuccessCheckmark";
import type { StructuredError } from "@/components/EmailComposer";

interface AttachmentItem {
  name: string;
  url: string;
  contentType: string;
  size?: number;
  source: "project" | "upload";
}

interface ProjectDoc {
  id: string;
  file_name: string;
  public_url: string | null;
  mime_type: string;
  file_size: number | null;
  file_path: string;
  storage_bucket: string;
}

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
  const [sending, setSending] = useState(false);
  const [sendingMode, setSendingMode] = useState<"send" | "draft" | null>(null);
  const [lastResult, setLastResult] = useState<{ mode: string; web_link?: string; message?: string } | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [showAttachments, setShowAttachments] = useState(false);
  const [projectDocs, setProjectDocs] = useState<ProjectDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const attachFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (defaultTo) setToList([defaultTo]);
    if (defaultSubject) setSubject(defaultSubject);
  }, [defaultTo, defaultSubject]);

  // Fetch project documents when attachment panel opens
  useEffect(() => {
    if (!showAttachments || entityType !== "job") return;
    const fetchDocs = async () => {
      setDocsLoading(true);
      const { data } = await supabase
        .from("documents")
        .select("id, file_name, public_url, mime_type, file_size, file_path, storage_bucket")
        .eq("entity_type", "job")
        .eq("entity_id", entityId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      setProjectDocs((data || []) as ProjectDoc[]);
      setDocsLoading(false);
    };
    fetchDocs();
  }, [showAttachments, entityType, entityId]);

  const addProjectDoc = (doc: ProjectDoc) => {
    if (attachments.some(a => a.url === doc.public_url)) return;
    setAttachments(prev => [...prev, {
      name: doc.file_name,
      url: doc.public_url || "",
      contentType: doc.mime_type,
      size: doc.file_size || undefined,
      source: "project",
    }]);
  };

  const handleAttachUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`Filen er for stor (maks 10 MB)`, { description: file.name });
        continue;
      }
      const filePath = `${entityId}/email-attach-${Date.now()}-${file.name.replace(/[^\w.\-()]/g, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from("job-attachments")
        .upload(filePath, file);
      if (uploadError) {
        toast.error(`Opplasting feilet: ${file.name}`);
        continue;
      }
      const { data: urlData } = supabase.storage
        .from("job-attachments")
        .getPublicUrl(filePath);

      setAttachments(prev => [...prev, {
        name: file.name,
        url: urlData.publicUrl,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        source: "upload",
      }]);
    }
    if (attachFileRef.current) attachFileRef.current.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const buildHtmlBody = () => {
    const userContent = bodyText.split("\n").map(line => `<p>${line || "&nbsp;"}</p>`).join("");
    return defaultBodyHtml ? userContent + "<br/>" + defaultBodyHtml : userContent;
  };

  const validTo = toList.filter(e => e.trim());
  const canSend = validTo.length > 0 && bodyText.trim().length > 0;
  const disabledReason = !validTo.length ? "Legg til mottaker for å sende" : !bodyText.trim() ? "Skriv en melding for å sende" : "";

  const handleAction = async (mode: "send" | "draft") => {
    if (mode === "send" && !canSend) return;
    if (mode === "draft" && validTo.length === 0) { toast.error("Legg til minst én mottaker"); return; }
    if (!subject.trim()) { toast.error("Emne er påkrevd"); return; }

    setSending(true);
    setSendingMode(mode);
    setLastResult(null);
    setShowSuccess(false);
    try {
      const payload: any = {
        action: mode === "send" ? "send_mail" : "create_draft",
        entity_type: entityType,
        entity_id: entityId,
        to: validTo,
        cc: ccList.filter(e => e.trim()),
        subject: subject.trim(),
        body_html: buildHtmlBody(),
      };

      if (attachments.length > 0) {
        payload.attachments = attachments.map(a => ({
          name: a.name,
          url: a.url,
          contentType: a.contentType,
        }));
      }

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

      if (mode === "send") {
        setShowSuccess(true);
        toast.success("E-post sendt");
        setLastResult({ mode: "sent", web_link: data.web_link });
        setBodyText("");
        setAttachments([]);
        setTimeout(() => setShowSuccess(false), 3000);
      } else {
        toast.success("Kladd lagret i Outlook");
        setLastResult({ mode: "draft", web_link: data.web_link });
      }
      onSent?.();
    } catch (err: any) {
      console.error("[EmailComposeForm] Error:", err);
      toast.error("Feil ved e-postsending");
    } finally {
      setSending(false);
      setSendingMode(null);
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

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

        {/* Attachments section */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowAttachments(!showAttachments)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 font-medium"
          >
            <Paperclip className="h-3.5 w-3.5" />
            Vedlegg {attachments.length > 0 && `(${attachments.length})`}
            {showAttachments ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {/* Attached files list */}
          {attachments.length > 0 && (
            <div className="space-y-1">
              {attachments.map((att, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-lg border border-border/40 px-2.5 py-1.5 bg-secondary/30">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium truncate flex-1">{att.name}</span>
                  {att.size && <span className="text-[10px] text-muted-foreground">{formatSize(att.size)}</span>}
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                    {att.source === "project" ? "Prosjekt" : "Opplastet"}
                  </Badge>
                  <button onClick={() => removeAttachment(idx)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showAttachments && (
            <div className="rounded-lg border border-border/40 p-3 space-y-3 bg-secondary/20">
              {/* Upload new */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => attachFileRef.current?.click()}
                  disabled={sending}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Last opp fil
                </Button>
                <input
                  ref={attachFileRef}
                  type="file"
                  multiple
                  onChange={handleAttachUpload}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.csv,.txt"
                />
                <span className="text-[10px] text-muted-foreground">Maks 10 MB per fil</span>
              </div>

              {/* Pick from project */}
              {entityType === "job" && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Fra prosjektets dokumenter:</p>
                  {docsLoading ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Laster...</span>
                    </div>
                  ) : projectDocs.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-1">Ingen dokumenter på dette prosjektet.</p>
                  ) : (
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {projectDocs.filter(d => d.public_url).map(doc => {
                        const isAdded = attachments.some(a => a.url === doc.public_url);
                        return (
                          <button
                            key={doc.id}
                            onClick={() => addProjectDoc(doc)}
                            disabled={isAdded}
                            className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/50 transition-colors disabled:opacity-50"
                          >
                            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs truncate flex-1">{doc.file_name}</span>
                            {isAdded ? (
                              <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                            ) : (
                              <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => handleAction("draft")}
            disabled={sending}
            className="gap-1.5"
          >
            {sendingMode === "draft" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileEdit className="h-4 w-4" />
            )}
            Lagre kladd
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  onClick={() => handleAction("send")}
                  disabled={sending || !canSend}
                  className="gap-1.5"
                >
                  {sendingMode === "send" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : showSuccess ? (
                    <SuccessCheckmark size={16} />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send e-post
                </Button>
              </span>
            </TooltipTrigger>
            {!canSend && disabledReason && (
              <TooltipContent>
                <p>{disabledReason}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Result */}
        {lastResult && (
          <div className="flex items-center gap-2 p-3 rounded-lg border bg-secondary/50">
            <CheckCircle className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm flex-1">
              {lastResult.message || (lastResult.mode === "sent" ? "E-post sendt!" : "Kladd lagret i Outlook")}
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
