import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CaseEmailViewer } from "@/components/cases/CaseEmailViewer";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Mail, Paperclip, Search, AtSign, ChevronRight,
  Filter, SortDesc, MailOpen,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

interface JobEmailTabProps {
  jobId: string;
  linkField: "linked_work_order_id" | "linked_project_id";
}

interface EmailItem {
  id: string;
  case_id: string;
  type: string;
  subject: string | null;
  subject_normalized?: string | null;
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
  in_reply_to?: string | null;
  references_header?: string | null;
  attachments_meta?: any[] | null;
  mentioned_user_ids?: string[] | null;
  mentioned_emails?: string[] | null;
  is_read?: boolean;
}

interface ThreadGroup {
  id: string; // conversation_id or first message id
  subject: string;
  lastMessageAt: Date;
  lastFrom: string;
  preview: string;
  messageCount: number;
  hasAttachments: boolean;
  hasUnread: boolean;
  mentionsMe: boolean;
  messages: EmailItem[];
}

type FilterMode = "all" | "unread" | "attachments" | "mentions";

export function JobEmailTab({ jobId, linkField }: JobEmailTabProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);

    // Find cases linked to this job/project
    const { data: cases } = await supabase
      .from("cases")
      .select("id")
      .eq(linkField, jobId);

    if (!cases || cases.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const caseIds = cases.map((c: any) => c.id);

    const { data } = await supabase
      .from("case_items")
      .select("*")
      .in("case_id", caseIds)
      .eq("type", "email")
      .order("created_at", { ascending: true });

    setItems((data as EmailItem[]) || []);
    setLoading(false);
  }, [jobId, linkField]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Group emails into threads
  const threads = useMemo(() => {
    const conversations = new Map<string, EmailItem[]>();
    const messageIdToConv = new Map<string, string>();

    for (const item of items) {
      let key = item.conversation_id || null;

      if (!key && item.in_reply_to) {
        key = messageIdToConv.get(item.in_reply_to) || null;
      }
      if (!key && item.references_header) {
        const refs = item.references_header.split(/\s+/).filter(Boolean);
        for (const ref of refs) {
          const found = messageIdToConv.get(ref);
          if (found) { key = found; break; }
        }
      }
      if (!key) key = item.id;

      if (!conversations.has(key)) conversations.set(key, []);
      conversations.get(key)!.push(item);

      if (item.internet_message_id) {
        messageIdToConv.set(item.internet_message_id, key);
      }
    }

    const result: ThreadGroup[] = [];
    for (const [convId, msgs] of conversations) {
      msgs.sort((a, b) =>
        new Date(a.sent_at || a.received_at || a.created_at).getTime() -
        new Date(b.sent_at || b.received_at || b.created_at).getTime()
      );
      const last = msgs[msgs.length - 1];
      const lastDate = new Date(last.sent_at || last.received_at || last.created_at);

      result.push({
        id: convId,
        subject: last.subject || msgs[0].subject || "(Uten emne)",
        lastMessageAt: lastDate,
        lastFrom: last.from_name || last.from_email || "Ukjent",
        preview: last.body_preview || "",
        messageCount: msgs.length,
        hasAttachments: msgs.some(m => m.attachments_meta && (m.attachments_meta as any[]).length > 0),
        hasUnread: msgs.some(m => !m.is_read),
        mentionsMe: user?.id ? msgs.some(m => m.mentioned_user_ids?.includes(user.id)) : false,
        messages: msgs,
      });
    }

    // Sort by last message date desc (newest first)
    result.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
    return result;
  }, [items, user?.id]);

  // Apply search and filter
  const filteredThreads = useMemo(() => {
    let result = threads;

    if (filterMode === "unread") result = result.filter(t => t.hasUnread);
    if (filterMode === "attachments") result = result.filter(t => t.hasAttachments);
    if (filterMode === "mentions") result = result.filter(t => t.mentionsMe);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.subject.toLowerCase().includes(q) ||
        t.lastFrom.toLowerCase().includes(q) ||
        t.preview.toLowerCase().includes(q) ||
        t.messages.some(m =>
          (m.from_email || "").toLowerCase().includes(q) ||
          (m.body_preview || "").toLowerCase().includes(q)
        )
      );
    }

    return result;
  }, [threads, filterMode, search]);

  // Selected thread
  const selectedThread = filteredThreads.find(t => t.id === selectedThreadId);

  // Mark thread as read when selected
  useEffect(() => {
    if (!selectedThread || !selectedThread.hasUnread) return;
    const unreadIds = selectedThread.messages.filter(m => !m.is_read).map(m => m.id);
    if (unreadIds.length === 0) return;

    // Optimistic update
    setItems(prev => prev.map(item =>
      unreadIds.includes(item.id) ? { ...item, is_read: true } : item
    ));

    // Persist
    supabase
      .from("case_items")
      .update({ is_read: true } as any)
      .in("id", unreadIds)
      .then();
  }, [selectedThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const unreadCount = threads.filter(t => t.hasUnread).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Mail className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">Ingen e-poster koblet</p>
        <p className="text-xs mt-1">Koble en sak fra Postkontoret for å se e-poster her</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[600px]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-card/50">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Søk e-post..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="unread">Ulest{unreadCount > 0 ? ` (${unreadCount})` : ""}</SelectItem>
            <SelectItem value="attachments">Med vedlegg</SelectItem>
            <SelectItem value="mentions">Nevner meg</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
          <SortDesc className="h-3 w-3" />
          <span>{filteredThreads.length} tråd{filteredThreads.length !== 1 ? "er" : ""}</span>
        </div>
      </div>

      {/* Split pane */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Thread list */}
        <div className="w-80 shrink-0 border-r border-border flex flex-col">
          <ScrollArea className="flex-1">
            {filteredThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Mail className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-xs">Ingen treff</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredThreads.map(thread => {
                  const isSelected = selectedThreadId === thread.id;
                  return (
                    <button
                      key={thread.id}
                      onClick={() => setSelectedThreadId(thread.id)}
                      className={`w-full text-left p-3 transition-colors ${
                        isSelected
                          ? "bg-primary/5 border-l-2 border-l-primary"
                          : "hover:bg-muted/50 border-l-2 border-l-transparent"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 shrink-0">
                          {thread.hasUnread ? (
                            <Mail className="h-4 w-4 text-primary" />
                          ) : (
                            <MailOpen className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-sm truncate ${thread.hasUnread ? "font-semibold text-foreground" : "text-foreground"}`}>
                              {thread.lastFrom}
                            </p>
                            {thread.messageCount > 1 && (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">
                                {thread.messageCount}
                              </Badge>
                            )}
                          </div>
                          <p className={`text-xs truncate mt-0.5 ${thread.hasUnread ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                            {thread.subject}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {thread.preview}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(thread.lastMessageAt, { locale: nb, addSuffix: true })}
                            </span>
                            {thread.hasAttachments && (
                              <Paperclip className="h-3 w-3 text-muted-foreground" />
                            )}
                            {thread.mentionsMe && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5 border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400">
                                <AtSign className="h-2.5 w-2.5" />
                              </Badge>
                            )}
                            {thread.hasUnread && (
                              <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right: Email viewer */}
        <div className="flex-1 min-w-0 flex flex-col">
          {selectedThread ? (
            <ScrollArea className="flex-1">
              <div className="p-4">
                <CaseEmailViewer items={selectedThread.messages} />
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Mail className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Velg en e-posttråd</p>
              <p className="text-xs mt-1">Klikk en tråd i listen for å lese</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
