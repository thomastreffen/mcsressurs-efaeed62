import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Inbox,
  RefreshCw,
  Search,
  Mail,
  MailOpen,
  FolderKanban,
  UserPlus,
  Link2,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Paperclip,
  Filter,
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

type InboxMessage = {
  id: string;
  external_id: string;
  subject: string;
  from_name: string | null;
  from_email: string | null;
  received_at: string;
  body_preview: string | null;
  body_full: string | null;
  has_attachments: boolean;
  ai_category: string | null;
  ai_confidence: number | null;
  status: string;
  linked_project_id: string | null;
  linked_lead_id: string | null;
  assigned_user_id: string | null;
  fetched_by: string | null;
};

type FilterType = "all" | "new" | "converted" | "action" | "mine";

const FILTER_OPTIONS: { key: FilterType; label: string; icon: React.ElementType }[] = [
  { key: "all", label: "Alle", icon: Inbox },
  { key: "new", label: "Ubehandlet", icon: Mail },
  { key: "converted", label: "Konvertert", icon: CheckCircle2 },
  { key: "action", label: "Krever handling", icon: AlertCircle },
  { key: "mine", label: "Kun meg", icon: Filter },
];

const AI_CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  project_request: { label: "Prosjektforespørsel", color: "bg-primary/10 text-primary" },
  lead: { label: "Ny kunde/lead", color: "bg-accent/10 text-accent" },
  follow_up: { label: "Oppfølging", color: "bg-info/10 text-info-foreground" },
  invoice: { label: "Faktura", color: "bg-muted text-muted-foreground" },
  support: { label: "Support", color: "bg-destructive/10 text-destructive" },
  general: { label: "Generelt", color: "bg-secondary text-secondary-foreground" },
};

export default function InboxPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  const selectedMessage = messages.find((m) => m.id === selectedId);

  // Fetch messages from DB
  const fetchMessages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inbox_messages")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Failed to load inbox:", error);
      toast.error("Kunne ikke laste innboks");
    } else {
      setMessages((data as unknown as InboxMessage[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  // Sync from Outlook
  const syncInbox = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("inbox-sync");
      if (error) throw error;
      if (data?.ms_reauth) {
        toast.error("Microsoft-tilkobling må fornyes. Gå til Integrasjoner.");
        return;
      }
      toast.success(`Synkronisert! ${data?.new_messages || 0} nye meldinger.`);
      await fetchMessages();
    } catch (err: any) {
      toast.error("Synkronisering feilet: " + (err.message || "Ukjent feil"));
    } finally {
      setSyncing(false);
    }
  };

  // Mark as opened
  const openMessage = async (msg: InboxMessage) => {
    setSelectedId(msg.id);
    if (msg.status === "new") {
      await supabase
        .from("inbox_messages")
        .update({ status: "opened" } as any)
        .eq("id", msg.id);
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, status: "opened" } : m))
      );
    }
  };

  // AI analyze
  const analyzeMessage = async (msg: InboxMessage) => {
    setAnalyzing(msg.id);
    try {
      // Simple heuristic AI classification (runs client-side for now)
      const text = `${msg.subject} ${msg.body_preview || ""}`.toLowerCase();
      let category = "general";
      let confidence = 0.5;

      if (text.match(/tilbud|pris|kostnadsestimat|befaring|prosjekt/)) {
        category = "project_request";
        confidence = 0.8;
      } else if (text.match(/ny kunde|interessert|forespørsel|kontakt/)) {
        category = "lead";
        confidence = 0.75;
      } else if (text.match(/faktura|betaling|kreditnota/)) {
        category = "invoice";
        confidence = 0.85;
      } else if (text.match(/feil|problem|reklamasjon|klage/)) {
        category = "support";
        confidence = 0.7;
      } else if (text.match(/oppfølging|purring|status|svar/)) {
        category = "follow_up";
        confidence = 0.65;
      }

      await supabase
        .from("inbox_messages")
        .update({ ai_category: category, ai_confidence: confidence } as any)
        .eq("id", msg.id);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, ai_category: category, ai_confidence: confidence } : m
        )
      );
      toast.success("AI-analyse fullført");
    } catch {
      toast.error("AI-analyse feilet");
    } finally {
      setAnalyzing(null);
    }
  };

  // Convert to project
  const convertToProject = (msg: InboxMessage) => {
    const params = new URLSearchParams();
    params.set("fromInbox", msg.id);
    params.set("title", msg.subject);
    if (msg.from_name) params.set("customerHint", msg.from_name);
    navigate(`/projects/new?${params.toString()}`);
  };

  // Convert to lead
  const convertToLead = async (msg: InboxMessage) => {
    try {
      const { data, error } = await supabase
        .from("leads")
        .insert({
          company_name: msg.from_name || msg.from_email || "Ukjent",
          contact_name: msg.from_name,
          email: msg.from_email,
          source: "email_inbox",
          notes: `Fra innboks: ${msg.subject}\n\n${msg.body_preview || ""}`,
          status: "new",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .select("id")
        .single();

      if (error) throw error;

      await supabase
        .from("inbox_messages")
        .update({ status: "converted", linked_lead_id: data.id } as any)
        .eq("id", msg.id);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, status: "converted", linked_lead_id: data.id } : m
        )
      );

      toast.success("Lead opprettet!");
      navigate(`/sales/leads/${data.id}`);
    } catch (err: any) {
      toast.error("Kunne ikke opprette lead: " + (err.message || ""));
    }
  };

  // Link to existing project
  const linkToProject = async (msg: InboxMessage, projectId: string) => {
    await supabase
      .from("inbox_messages")
      .update({ status: "converted", linked_project_id: projectId } as any)
      .eq("id", msg.id);

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id ? { ...m, status: "converted", linked_project_id: projectId } : m
      )
    );
    toast.success("Koblet til prosjekt");
  };

  // Filter logic
  const filtered = messages.filter((m) => {
    if (filter === "new" && m.status !== "new") return false;
    if (filter === "converted" && m.status !== "converted") return false;
    if (filter === "action" && !["new", "opened"].includes(m.status)) return false;
    if (filter === "mine" && m.assigned_user_id !== user?.id && m.fetched_by !== user?.id) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        m.subject.toLowerCase().includes(q) ||
        (m.from_name || "").toLowerCase().includes(q) ||
        (m.from_email || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const statusCounts = {
    all: messages.length,
    new: messages.filter((m) => m.status === "new").length,
    converted: messages.filter((m) => m.status === "converted").length,
    action: messages.filter((m) => ["new", "opened"].includes(m.status)).length,
    mine: messages.filter(
      (m) => m.assigned_user_id === user?.id || (m as any).fetched_by === user?.id
    ).length,
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Inbox className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Innboks</h1>
            <p className="text-xs text-muted-foreground">
              {statusCounts.new > 0
                ? `${statusCounts.new} ubehandlet${statusCounts.new > 1 ? "e" : ""}`
                : "Ingen nye meldinger"}
            </p>
          </div>
        </div>
        <Button onClick={syncInbox} disabled={syncing} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Synkroniserer..." : "Synk e-post"}
        </Button>
      </div>

      {/* Main layout: filters | list | preview */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Filters */}
        <div className="w-52 shrink-0 border-r border-border bg-card p-3 space-y-1">
          {FILTER_OPTIONS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === f.key
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <f.icon className="h-4 w-4" />
              <span className="flex-1 text-left">{f.label}</span>
              <span className="text-xs tabular-nums">
                {statusCounts[f.key]}
              </span>
            </button>
          ))}
        </div>

        {/* Center: Message list */}
        <div className="w-96 shrink-0 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Søk i innboks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            {loading ? (
              <div className="p-3 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="space-y-2 p-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Mail className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">Ingen meldinger</p>
                <p className="text-xs mt-1">Klikk «Synk e-post» for å hente fra Outlook</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => openMessage(msg)}
                    className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                      selectedId === msg.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                    } ${msg.status === "new" ? "bg-primary/[0.02]" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5">
                        {msg.status === "new" ? (
                          <Mail className="h-4 w-4 text-primary" />
                        ) : msg.status === "converted" ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <MailOpen className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm truncate ${
                              msg.status === "new" ? "font-semibold text-foreground" : "text-foreground"
                            }`}
                          >
                            {msg.from_name || msg.from_email || "Ukjent"}
                          </span>
                          {msg.has_attachments && <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />}
                        </div>
                        <p
                          className={`text-sm truncate ${
                            msg.status === "new" ? "font-medium text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {msg.subject}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(msg.received_at), "d. MMM HH:mm", { locale: nb })}
                          </span>
                          {msg.ai_category && AI_CATEGORY_LABELS[msg.ai_category] && (
                            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${AI_CATEGORY_LABELS[msg.ai_category].color}`}>
                              {AI_CATEGORY_LABELS[msg.ai_category].label}
                            </Badge>
                          )}
                          {msg.status === "converted" && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-success/10 text-success">
                              Konvertert
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right: Preview + Actions */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedMessage ? (
            <MessagePreview
              message={selectedMessage}
              onAnalyze={() => analyzeMessage(selectedMessage)}
              onConvertProject={() => convertToProject(selectedMessage)}
              onConvertLead={() => convertToLead(selectedMessage)}
              analyzing={analyzing === selectedMessage.id}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Inbox className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-sm">Velg en melding for å se forhåndsvisning</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MessagePreview({
  message,
  onAnalyze,
  onConvertProject,
  onConvertLead,
  analyzing,
}: {
  message: InboxMessage;
  onAnalyze: () => void;
  onConvertProject: () => void;
  onConvertLead: () => void;
  analyzing: boolean;
}) {
  const navigate = useNavigate();
  const catInfo = message.ai_category ? AI_CATEGORY_LABELS[message.ai_category] : null;

  return (
    <ScrollArea className="flex-1">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-foreground">{message.subject}</h2>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {message.from_name || "Ukjent"}
            </span>
            {message.from_email && (
              <span className="text-xs">&lt;{message.from_email}&gt;</span>
            )}
            <span>·</span>
            <span>{format(new Date(message.received_at), "d. MMMM yyyy, HH:mm", { locale: nb })}</span>
            {message.has_attachments && (
              <Badge variant="outline" className="text-xs">
                <Paperclip className="h-3 w-3 mr-1" />
                Vedlegg
              </Badge>
            )}
          </div>
        </div>

        <Separator />

        {/* Converted status */}
        {message.status === "converted" && (
          <Card className="p-4 bg-success/5 border-success/20">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium text-sm">Konvertert</span>
            </div>
            <div className="flex gap-2 mt-2">
              {message.linked_project_id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/projects/${message.linked_project_id}`)}
                >
                  <FolderKanban className="h-4 w-4 mr-1" />
                  Gå til prosjekt
                </Button>
              )}
              {message.linked_lead_id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/sales/leads/${message.linked_lead_id}`)}
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  Gå til lead
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* AI Analysis */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium text-foreground">AI-analyse</span>
            </div>
            {!message.ai_category && (
              <Button
                variant="outline"
                size="sm"
                onClick={onAnalyze}
                disabled={analyzing}
              >
                {analyzing ? (
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 mr-1" />
                )}
                Analyser
              </Button>
            )}
          </div>

          {message.ai_category && catInfo ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className={catInfo.color}>{catInfo.label}</Badge>
                {message.ai_confidence != null && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(message.ai_confidence * 100)}% sikkerhet
                  </span>
                )}
              </div>

              {/* Suggested actions */}
              <div className="pt-2 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Foreslåtte handlinger
                </p>
                {(message.ai_category === "project_request" || message.ai_category === "support") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-between"
                    onClick={onConvertProject}
                    disabled={message.status === "converted"}
                  >
                    <span className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4" />
                      Opprett prosjekt
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
                {(message.ai_category === "lead" || message.ai_category === "general") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-between"
                    onClick={onConvertLead}
                    disabled={message.status === "converted"}
                  >
                    <span className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      Opprett lead
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
                {/* Always show both options */}
                {message.ai_category !== "project_request" && message.ai_category !== "support" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between text-muted-foreground"
                    onClick={onConvertProject}
                    disabled={message.status === "converted"}
                  >
                    <span className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4" />
                      Opprett prosjekt
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
                {message.ai_category !== "lead" && message.ai_category !== "general" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between text-muted-foreground"
                    onClick={onConvertLead}
                    disabled={message.status === "converted"}
                  >
                    <span className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      Opprett lead
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Klikk «Analyser» for å la AI kategorisere og foreslå handling.
            </p>
          )}
        </Card>

        {/* Actions bar (always visible) */}
        {message.status !== "converted" && (
          <Card className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Hurtighandlinger
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={onConvertProject}>
                <FolderKanban className="h-4 w-4 mr-1" />
                Opprett prosjekt
              </Button>
              <Button size="sm" variant="secondary" onClick={onConvertLead}>
                <UserPlus className="h-4 w-4 mr-1" />
                Opprett lead
              </Button>
            </div>
          </Card>
        )}

        {/* Body preview */}
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Innhold
          </p>
          {message.body_full ? (
            <div
              className="prose prose-sm max-w-none text-foreground"
              dangerouslySetInnerHTML={{ __html: message.body_full }}
            />
          ) : (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {message.body_preview || "Ingen innhold"}
            </p>
          )}
        </Card>
      </div>
    </ScrollArea>
  );
}
