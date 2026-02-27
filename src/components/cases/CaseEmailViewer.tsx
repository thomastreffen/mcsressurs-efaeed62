import { useState } from "react";
import DOMPurify from "dompurify";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail, ArrowRightLeft, FileText, Clock, ChevronDown, ChevronUp,
  Eye, MessageSquare, Paperclip,
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface CaseItem {
  id: string;
  case_id: string;
  type: string;
  subject: string | null;
  from_email: string | null;
  from_name?: string | null;
  body_preview: string | null;
  body_html: string | null;
  body_text?: string | null;
  received_at: string | null;
  sent_at?: string | null;
  created_by: string | null;
  created_at: string;
  conversation_id?: string | null;
  to_emails?: string[] | null;
  cc_emails?: string[] | null;
  internet_message_id?: string | null;
  attachments_meta?: any[] | null;
}

interface CaseEmailViewerProps {
  items: CaseItem[];
}

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p','br','b','i','u','strong','em','a','ul','ol','li','span','div','table','tr','td','th','thead','tbody','h1','h2','h3','h4','h5','h6','blockquote','pre','code','img','hr','style'],
  ALLOWED_ATTR: ['href','target','src','alt','class','style','width','height','cellpadding','cellspacing','border','bgcolor','color','align','valign'],
  ALLOW_DATA_ATTR: false,
};

export function CaseEmailViewer({ items }: CaseEmailViewerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showThread, setShowThread] = useState(false);

  // Separate emails and system/note items
  const emailItems = items.filter((i) => i.type === "email");
  const otherItems = items.filter((i) => i.type !== "email");

  // Group emails by conversation_id
  const conversations = new Map<string, CaseItem[]>();
  for (const item of emailItems) {
    const key = item.conversation_id || item.id;
    if (!conversations.has(key)) conversations.set(key, []);
    conversations.get(key)!.push(item);
  }
  // Sort each conversation by sent_at/received_at
  for (const [, msgs] of conversations) {
    msgs.sort((a, b) => new Date(a.sent_at || a.received_at || a.created_at).getTime() - new Date(b.sent_at || b.received_at || b.created_at).getTime());
  }

  const hasMultipleConversations = conversations.size > 1;
  const hasThreads = Array.from(conversations.values()).some((msgs) => msgs.length > 1);

  const renderEmailCard = (item: CaseItem, isExpanded: boolean) => {
    const dateStr = item.sent_at || item.received_at || item.created_at;
    const hasBody = item.body_html || item.body_text;
    const hasAttachments = item.attachments_meta && (item.attachments_meta as any[]).length > 0;

    return (
      <Card key={item.id} className={`overflow-hidden ${isExpanded ? "ring-1 ring-primary/20" : ""}`}>
        <button
          type="button"
          onClick={() => setExpandedId(isExpanded ? null : item.id)}
          className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-start gap-3">
            <Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate">{item.subject || "(Uten emne)"}</p>
                {hasAttachments && <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-muted-foreground">
                  {item.from_name || item.from_email || "Ukjent avsender"}
                </span>
                {item.to_emails && item.to_emails.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    → {item.to_emails.slice(0, 2).join(", ")}
                    {item.to_emails.length > 2 && ` +${item.to_emails.length - 2}`}
                  </span>
                )}
              </div>
              {!isExpanded && item.body_preview && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.body_preview}</p>
              )}
              <span className="text-xs text-muted-foreground mt-1 block">
                {format(new Date(dateStr), "d. MMM yyyy, HH:mm", { locale: nb })}
              </span>
            </div>
            <div className="shrink-0">
              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
        </button>

        {isExpanded && hasBody && (
          <div className="border-t border-border">
            {/* Meta bar */}
            <div className="px-4 py-2 bg-muted/30 text-xs text-muted-foreground space-y-0.5">
              <p><span className="font-medium">Fra:</span> {item.from_name ? `${item.from_name} <${item.from_email}>` : item.from_email}</p>
              {item.to_emails && <p><span className="font-medium">Til:</span> {item.to_emails.join(", ")}</p>}
              {item.cc_emails && item.cc_emails.length > 0 && <p><span className="font-medium">Kopi:</span> {item.cc_emails.join(", ")}</p>}
              <p><span className="font-medium">Dato:</span> {format(new Date(dateStr), "EEEE d. MMMM yyyy, HH:mm", { locale: nb })}</p>
            </div>
            {/* Email body */}
            <div className="p-4">
              {item.body_html ? (
                <div
                  className="prose prose-sm max-w-none text-foreground [&_img]:max-w-full [&_table]:text-xs"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(item.body_html, SANITIZE_CONFIG),
                  }}
                />
              ) : (
                <pre className="text-sm text-foreground whitespace-pre-wrap font-sans">{item.body_text || item.body_preview}</pre>
              )}
            </div>
            {/* Attachments */}
            {hasAttachments && (
              <div className="px-4 pb-3 border-t border-border pt-2">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Vedlegg</p>
                <div className="flex flex-wrap gap-1.5">
                  {(item.attachments_meta as any[]).map((att: any, idx: number) => (
                    <Badge key={idx} variant="outline" className="text-[10px] gap-1">
                      <Paperclip className="h-3 w-3" />
                      {att.filename || att.name || `Vedlegg ${idx + 1}`}
                      {att.size && <span className="text-muted-foreground">({Math.round(att.size / 1024)}KB)</span>}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    );
  };

  const renderSystemItem = (item: CaseItem) => (
    <Card key={item.id} className="p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {item.type === "system" ? (
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          ) : item.type === "note" ? (
            <FileText className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {item.subject && <p className="text-sm font-medium text-foreground">{item.subject}</p>}
          {item.body_preview && (
            <p className="text-sm text-muted-foreground mt-1">{item.body_preview}</p>
          )}
          <span className="text-xs text-muted-foreground mt-1 block">
            {format(new Date(item.received_at || item.created_at), "d. MMM yyyy, HH:mm", { locale: nb })}
          </span>
        </div>
      </div>
    </Card>
  );

  // Sort all items chronologically
  const allSorted = [...items].sort(
    (a, b) => new Date(a.sent_at || a.received_at || a.created_at).getTime() - new Date(b.sent_at || b.received_at || b.created_at).getTime()
  );

  return (
    <div>
      {/* Thread toggle */}
      {hasThreads && (
        <div className="flex items-center gap-2 mb-3">
          <Button
            variant={showThread ? "default" : "outline"}
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setShowThread(!showThread)}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {showThread ? "Vis tidslinje" : "Vis tråder"}
          </Button>
          {showThread && (
            <span className="text-xs text-muted-foreground">
              {conversations.size} samtale{conversations.size !== 1 ? "r" : ""}
            </span>
          )}
        </div>
      )}

      {showThread ? (
        // Thread view: group by conversation
        <div className="space-y-4">
          {Array.from(conversations.entries()).map(([convId, msgs]) => (
            <div key={convId} className="space-y-2">
              {msgs.length > 1 && (
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Tråd · {msgs.length} meldinger
                  </span>
                </div>
              )}
              <div className={`space-y-2 ${msgs.length > 1 ? "ml-2 pl-3 border-l-2 border-primary/20" : ""}`}>
                {msgs.map((item) => renderEmailCard(item, expandedId === item.id))}
              </div>
            </div>
          ))}
          {/* System/note items at the end */}
          {otherItems.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Systemhendelser</span>
              {otherItems.map(renderSystemItem)}
            </div>
          )}
        </div>
      ) : (
        // Timeline view: chronological
        <div className="space-y-2">
          {allSorted.map((item) =>
            item.type === "email"
              ? renderEmailCard(item, expandedId === item.id)
              : renderSystemItem(item)
          )}
        </div>
      )}
    </div>
  );
}
