import { useState, useEffect, useCallback } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Building2,
  RefreshCw,
  Search,
  Mail,
  MailOpen,
  FolderKanban,
  UserPlus,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  Users,
  Lock,
  Unlock,
  UserCheck,
  Eye,
  Clock,
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
  mailbox_address: string | null;
  owner_user_id: string | null;
  participant_user_ids: string[] | null;
  visibility: string;
  assigned_at: string | null;
};

type Mailbox = {
  id: string;
  address: string;
  display_name: string;
  is_enabled: boolean;
};

type FilterType = "mine" | "unhandled" | "needs_action" | "converted" | "team" | "private";

const FILTER_OPTIONS: { key: FilterType; label: string; icon: React.ElementType }[] = [
  { key: "mine", label: "Min kø", icon: UserCheck },
  { key: "unhandled", label: "Ubehandlet", icon: Mail },
  { key: "needs_action", label: "Krever handling", icon: AlertCircle },
  { key: "converted", label: "Konvertert", icon: CheckCircle2 },
  { key: "team", label: "Teamkø", icon: Users },
  { key: "private", label: "Mine private", icon: Lock },
];

const AI_CATEGORY_LABELS: Record<string, { label: string; color: string; action: string }> = {
  project_request: { label: "Prosjektforespørsel", color: "bg-primary/10 text-primary", action: "Opprett prosjekt" },
  lead: { label: "Prisforespørsel / Lead", color: "bg-accent/10 text-accent", action: "Opprett lead" },
  order: { label: "Bestilling / PO", color: "bg-success/10 text-success", action: "Opprett prosjekt" },
  follow_up: { label: "Oppfølging", color: "bg-muted text-muted-foreground", action: "" },
  invoice: { label: "Faktura", color: "bg-destructive/10 text-destructive", action: "Krever handling" },
  support: { label: "Support", color: "bg-destructive/10 text-destructive", action: "Opprett prosjekt" },
  general: { label: "Generelt", color: "bg-secondary text-secondary-foreground", action: "" },
  tavle: { label: "Tavle/skinne-forespørsel", color: "bg-primary/10 text-primary", action: "Opprett lead" },
};

export default function InboxPage() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("mine");
  const [search, setSearch] = useState("");
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<string>("all");
  const [companyUsers, setCompanyUsers] = useState<{ id: string; name: string }[]>([]);
  const [assigningTo, setAssigningTo] = useState<string | null>(null);

  const selectedMessage = messages.find((m) => m.id === selectedId);

  const fetchMailboxes = useCallback(async () => {
    const { data } = await supabase.from("mailboxes").select("*").order("created_at");
    setMailboxes((data as unknown as Mailbox[]) || []);
  }, []);

  const fetchCompanyUsers = useCallback(async () => {
    const { data } = await supabase.from("technicians").select("user_id, name");
    setCompanyUsers((data || []).filter((t: any) => t.user_id && t.name).map((t: any) => ({ id: t.user_id, name: t.name })));
  }, []);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inbox_messages")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Failed to load inbox:", error);
      toast.error("Kunne ikke laste Postkontoret");
    } else {
      setMessages((data as unknown as InboxMessage[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMessages();
    fetchMailboxes();
    fetchCompanyUsers();
  }, [fetchMessages, fetchMailboxes, fetchCompanyUsers]);

  const syncInbox = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("inbox-sync");
      if (error) throw error;
      if (data?.ms_reauth) {
        toast.error("Microsoft-tilkobling må fornyes. Gå til Integrasjoner.");
        return;
      }
      const mb = data?.mailboxes_synced || 1;
      toast.success(`Synkronisert ${mb} postboks${mb > 1 ? "er" : ""}! ${data?.new_messages || 0} nye, ${data?.skipped || 0} duplikater.`);
      await fetchMessages();
    } catch (err: any) {
      toast.error("Synkronisering feilet: " + (err.message || "Ukjent feil"));
    } finally {
      setSyncing(false);
    }
  };

  const openMessage = async (msg: InboxMessage) => {
    setSelectedId(msg.id);
    if (msg.status === "new") {
      await supabase.from("inbox_messages").update({ status: "opened" } as any).eq("id", msg.id);
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: "opened" } : m)));
    }
  };

  const assignToMe = async (msg: InboxMessage) => {
    if (!user) return;
    const participants = [...(msg.participant_user_ids || [])];
    if (!participants.includes(user.id)) participants.push(user.id);
    await supabase.from("inbox_messages").update({
      owner_user_id: user.id,
      participant_user_ids: participants,
      assigned_at: new Date().toISOString(),
    } as any).eq("id", msg.id);
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, owner_user_id: user.id, participant_user_ids: participants, assigned_at: new Date().toISOString() } : m));
    toast.success("Tildelt deg");
  };

  const assignToUser = async (msg: InboxMessage, targetUserId: string) => {
    const participants = [...(msg.participant_user_ids || [])];
    if (!participants.includes(targetUserId)) participants.push(targetUserId);
    await supabase.from("inbox_messages").update({
      owner_user_id: targetUserId,
      participant_user_ids: participants,
      assigned_at: new Date().toISOString(),
    } as any).eq("id", msg.id);
    const name = companyUsers.find(u => u.id === targetUserId)?.name || "bruker";
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, owner_user_id: targetUserId, participant_user_ids: participants } : m));
    toast.success(`Tildelt ${name}`);
    setAssigningTo(null);
  };

  const toggleVisibility = async (msg: InboxMessage) => {
    const newVis = msg.visibility === "team" ? "private" : "team";
    await supabase.from("inbox_messages").update({ visibility: newVis } as any).eq("id", msg.id);
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, visibility: newVis } : m));
    toast.success(newVis === "private" ? "Satt til privat" : "Satt til team");
  };

  // AI analyze – tavle/strømskinne-oriented
  const analyzeMessage = async (msg: InboxMessage) => {
    setAnalyzing(msg.id);
    try {
      const text = `${msg.subject} ${msg.body_preview || ""}`.toLowerCase();
      let category = "general";
      let confidence = 0.5;

      // Tavle/strømskinne industry keywords
      if (text.match(/tavle|samleskinne|busbar|skinne|bryter|ampere|enlinje|strømskinne|schneider|eaton|siemens|onninen|abb|rittal|skap|fordeling/)) {
        category = "tavle";
        confidence = 0.85;
      } else if (text.match(/bestilling|ordre|po\b|vi aksepterer|bekreft|vi bestiller/)) {
        category = "order";
        confidence = 0.85;
      } else if (text.match(/pris|tilbud|kostnadsestimat|gi pris|prisforespørsel|forespørsel/)) {
        category = "lead";
        confidence = 0.8;
      } else if (text.match(/befaring|prosjekt|anlegg|installasjon/)) {
        category = "project_request";
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

      await supabase.from("inbox_messages").update({ ai_category: category, ai_confidence: confidence } as any).eq("id", msg.id);
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, ai_category: category, ai_confidence: confidence } : m));
      toast.success("AI-analyse fullført");
    } catch {
      toast.error("AI-analyse feilet");
    } finally {
      setAnalyzing(null);
    }
  };

  const convertToProject = (msg: InboxMessage) => {
    const params = new URLSearchParams();
    params.set("fromInbox", msg.id);
    params.set("title", msg.subject);
    if (msg.from_name) params.set("customerHint", msg.from_name);
    navigate(`/projects/new?${params.toString()}`);
  };

  const convertToLead = async (msg: InboxMessage) => {
    try {
      const { data, error } = await supabase
        .from("leads")
        .insert({
          company_name: msg.from_name || msg.from_email || "Ukjent",
          contact_name: msg.from_name,
          email: msg.from_email,
          source: "postkontoret",
          notes: `Fra Postkontoret: ${msg.subject}\n\n${msg.body_preview || ""}`,
          status: "new",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      await supabase.from("inbox_messages").update({ status: "converted", linked_lead_id: data.id } as any).eq("id", msg.id);
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, status: "converted", linked_lead_id: data.id } : m));
      toast.success("Lead opprettet!");
      navigate(`/sales/leads/${data.id}`);
    } catch (err: any) {
      toast.error("Kunne ikke opprette lead: " + (err.message || ""));
    }
  };

  // Filter logic
  const filtered = messages.filter((m) => {
    // Mailbox filter
    if (selectedMailbox !== "all" && m.mailbox_address !== selectedMailbox) return false;

    // Status filters
    switch (filter) {
      case "mine":
        return m.owner_user_id === user?.id || (m.participant_user_ids || []).includes(user?.id || "");
      case "unhandled":
        return m.status === "new";
      case "needs_action":
        return ["new", "opened"].includes(m.status) && m.status !== "converted";
      case "converted":
        return m.status === "converted";
      case "team":
        return m.visibility === "team";
      case "private":
        return m.visibility === "private" && (m.owner_user_id === user?.id || (m.participant_user_ids || []).includes(user?.id || ""));
    }
    return true;
  }).filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.subject.toLowerCase().includes(q) || (m.from_name || "").toLowerCase().includes(q) || (m.from_email || "").toLowerCase().includes(q);
  });

  const statusCounts: Record<FilterType, number> = {
    mine: messages.filter((m) => m.owner_user_id === user?.id || (m.participant_user_ids || []).includes(user?.id || "")).length,
    unhandled: messages.filter((m) => m.status === "new").length,
    needs_action: messages.filter((m) => ["new", "opened"].includes(m.status)).length,
    converted: messages.filter((m) => m.status === "converted").length,
    team: messages.filter((m) => m.visibility === "team").length,
    private: messages.filter((m) => m.visibility === "private" && (m.owner_user_id === user?.id || (m.participant_user_ids || []).includes(user?.id || ""))).length,
  };

  const ownerName = (id: string | null) => {
    if (!id) return null;
    if (id === user?.id) return "Deg";
    return companyUsers.find(u => u.id === id)?.name || null;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Postkontoret</h1>
            <p className="text-xs text-muted-foreground">
              {statusCounts.unhandled > 0
                ? `${statusCounts.unhandled} ubehandlet${statusCounts.unhandled > 1 ? "e" : ""}`
                : "Ingen nye meldinger"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mailbox filter */}
          <Select value={selectedMailbox} onValueChange={setSelectedMailbox}>
            <SelectTrigger className="w-48 h-9 text-sm">
              <SelectValue placeholder="Alle postbokser" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle postbokser</SelectItem>
              {mailboxes.filter(mb => mb.is_enabled).map(mb => (
                <SelectItem key={mb.id} value={mb.address}>{mb.display_name || mb.address}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={syncInbox} disabled={syncing} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Synkroniserer..." : "Synk e-post"}
          </Button>
        </div>
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
              <span className="text-xs tabular-nums">{statusCounts[f.key]}</span>
            </button>
          ))}
        </div>

        {/* Center: Message list */}
        <div className="w-96 shrink-0 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Søk i Postkontoret..."
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
                <p className="text-xs mt-1">Klikk «Synk e-post» for å hente fra postboksen</p>
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
                          <span className={`text-sm truncate ${msg.status === "new" ? "font-semibold text-foreground" : "text-foreground"}`}>
                            {msg.from_name || msg.from_email || "Ukjent"}
                          </span>
                          {msg.has_attachments && <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />}
                          {msg.visibility === "private" && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                        </div>
                        <p className={`text-sm truncate ${msg.status === "new" ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                          {msg.subject}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(msg.received_at), "d. MMM HH:mm", { locale: nb })}
                          </span>
                          {msg.owner_user_id && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {ownerName(msg.owner_user_id)}
                            </Badge>
                          )}
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
              onAssignToMe={() => assignToMe(selectedMessage)}
              onAssignToUser={(uid) => assignToUser(selectedMessage, uid)}
              onToggleVisibility={() => toggleVisibility(selectedMessage)}
              analyzing={analyzing === selectedMessage.id}
              companyUsers={companyUsers}
              currentUserId={user?.id || ""}
              isAdmin={isAdmin}
              ownerName={ownerName}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Building2 className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-sm font-medium">Velg en melding</p>
              <p className="text-xs mt-1">Velg en melding for å se innhold og handlinger</p>
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
  onAssignToMe,
  onAssignToUser,
  onToggleVisibility,
  analyzing,
  companyUsers,
  currentUserId,
  isAdmin,
  ownerName,
}: {
  message: InboxMessage;
  onAnalyze: () => void;
  onConvertProject: () => void;
  onConvertLead: () => void;
  onAssignToMe: () => void;
  onAssignToUser: (uid: string) => void;
  onToggleVisibility: () => void;
  analyzing: boolean;
  companyUsers: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
  ownerName: (id: string | null) => string | null;
}) {
  const navigate = useNavigate();
  const catInfo = message.ai_category ? AI_CATEGORY_LABELS[message.ai_category] : null;
  const canManageVisibility = isAdmin || message.owner_user_id === currentUserId;
  const [showAssignPicker, setShowAssignPicker] = useState(false);

  // AI summary
  const aiSummary = catInfo ? generateAiSummary(message, catInfo) : null;

  return (
    <ScrollArea className="flex-1">
      <div className="p-6 space-y-5">
        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {!message.owner_user_id ? (
            <Button size="sm" variant="default" onClick={onAssignToMe} className="gap-1.5">
              <UserCheck className="h-4 w-4" />
              Tildel meg
            </Button>
          ) : (
            <Badge variant="secondary" className="px-3 py-1.5 text-xs">
              <UserCheck className="h-3 w-3 mr-1" />
              Tildelt: {ownerName(message.owner_user_id)}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowAssignPicker(!showAssignPicker)} className="gap-1.5">
            <Users className="h-4 w-4" />
            Tildel…
          </Button>
          {canManageVisibility && (
            <Button size="sm" variant="outline" onClick={onToggleVisibility} className="gap-1.5">
              {message.visibility === "team" ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              {message.visibility === "team" ? "Sett privat" : "Sett team"}
            </Button>
          )}
          <Badge variant="outline" className="text-xs ml-auto">
            {message.visibility === "team" ? "Team" : "Privat"}
          </Badge>
        </div>

        {showAssignPicker && (
          <Card className="p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Velg person:</p>
            <div className="flex flex-wrap gap-1.5">
              {companyUsers.map(u => (
                <Button key={u.id} size="sm" variant="outline" className="text-xs h-7" onClick={() => { onAssignToUser(u.id); setShowAssignPicker(false); }}>
                  {u.name}
                </Button>
              ))}
            </div>
          </Card>
        )}

        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-foreground">{message.subject}</h2>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
            <span className="font-medium text-foreground">{message.from_name || "Ukjent"}</span>
            {message.from_email && <span className="text-xs">&lt;{message.from_email}&gt;</span>}
            <span>·</span>
            <span>{format(new Date(message.received_at), "d. MMMM yyyy, HH:mm", { locale: nb })}</span>
            {message.has_attachments && (
              <Badge variant="outline" className="text-xs">
                <Paperclip className="h-3 w-3 mr-1" />
                Vedlegg
              </Badge>
            )}
            {message.mailbox_address && message.mailbox_address !== "unknown" && (
              <Badge variant="outline" className="text-xs">
                <Building2 className="h-3 w-3 mr-1" />
                {message.mailbox_address}
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
                <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${message.linked_project_id}`)}>
                  <FolderKanban className="h-4 w-4 mr-1" />
                  Gå til prosjekt
                </Button>
              )}
              {message.linked_lead_id && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/sales/leads/${message.linked_lead_id}`)}>
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
              <Button variant="outline" size="sm" onClick={onAnalyze} disabled={analyzing}>
                {analyzing ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                Analyser
              </Button>
            )}
          </div>

          {message.ai_category && catInfo ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={catInfo.color}>{catInfo.label}</Badge>
                {message.ai_confidence != null && (
                  <span className="text-xs text-muted-foreground">{Math.round(message.ai_confidence * 100)}% sikkerhet</span>
                )}
              </div>

              {/* AI Summary */}
              {aiSummary && (
                <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI-oppsummering</p>
                  <p className="text-sm text-foreground">{aiSummary}</p>
                </div>
              )}

              {/* Recommended action */}
              {catInfo.action && message.status !== "converted" && (
                <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Anbefalt handling</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground flex-1">Forslag: {
                      (message.ai_category === "lead" || message.ai_category === "tavle") ? "Lead" : "Prosjekt"
                    }</p>
                    <Button size="sm" onClick={
                      (message.ai_category === "lead" || message.ai_category === "tavle") ? onConvertLead : onConvertProject
                    } className="gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Ja, konverter
                    </Button>
                    <Button size="sm" variant="ghost" className="text-muted-foreground">
                      Ikke nå
                    </Button>
                  </div>
                </div>
              )}

              {/* Alternative actions */}
              <div className="pt-1 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Andre handlinger</p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="text-xs" onClick={onConvertLead} disabled={message.status === "converted"}>
                    <UserPlus className="h-3.5 w-3.5 mr-1" />
                    Opprett lead
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={onConvertProject} disabled={message.status === "converted"}>
                    <FolderKanban className="h-3.5 w-3.5 mr-1" />
                    Opprett prosjekt
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Klikk «Analyser» for å la AI kategorisere og foreslå handling.
            </p>
          )}
        </Card>

        {/* Quick actions (always visible if not converted) */}
        {message.status !== "converted" && !message.ai_category && (
          <Card className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Hurtighandlinger</p>
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

        {/* Body */}
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Innhold</p>
          {message.body_full ? (
            <div className="prose prose-sm max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: message.body_full }} />
          ) : (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{message.body_preview || "Ingen innhold"}</p>
          )}
        </Card>
      </div>
    </ScrollArea>
  );
}

function generateAiSummary(msg: InboxMessage, catInfo: { label: string; action: string }): string {
  const from = msg.from_name || msg.from_email || "Avsender";
  const preview = (msg.body_preview || "").substring(0, 100);

  switch (msg.ai_category) {
    case "tavle":
      return `${from} ser ut til å ha en forespørsel relatert til tavle/strømskinne. ${preview ? `Utdrag: "${preview}..."` : ""}`;
    case "order":
      return `${from} sender det som ligner på en bestilling eller ordrebekreftelse. Anbefaler å opprette prosjekt.`;
    case "lead":
      return `${from} forespør pris eller informasjon. Anbefaler å opprette lead for oppfølging.`;
    case "project_request":
      return `${from} har en prosjektforespørsel. Vurder befaring eller direkte prosjektopprettelse.`;
    case "invoice":
      return `${from} sender fakturarelatert innhold. Krever manuell håndtering.`;
    case "support":
      return `${from} rapporterer et problem eller reklamasjon. Vurder å opprette prosjekt.`;
    default:
      return `${from} har sendt en melding. Les innholdet for å vurdere handling.`;
  }
}
