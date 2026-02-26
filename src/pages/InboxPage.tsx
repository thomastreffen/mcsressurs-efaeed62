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
  CheckCircle2,
  AlertCircle,
  Paperclip,
  Users,
  Lock,
  Unlock,
  UserCheck,
  Clock,
  Phone,
  FileText,
  Wrench,
  CalendarDays,
  Package,
  AlertTriangle,
  Timer,
  ReceiptText,
} from "lucide-react";
import { format, formatDistanceToNow, isPast, differenceInHours } from "date-fns";
import { nb } from "date-fns/locale";
import {
  CASE_STATUS_LABELS,
  CASE_STATUS_COLOR,
  CASE_PRIORITY_LABELS,
  CASE_PRIORITY_COLOR,
  CASE_NEXT_ACTION_LABELS,
  ALL_CASE_STATUSES,
  ALL_CASE_PRIORITIES,
  ALL_CASE_NEXT_ACTIONS,
  type CaseStatus,
  type CasePriority,
  type CaseNextAction,
  type CaseScope,
} from "@/lib/case-labels";

// ─── Types ───────────────────────────────────
type Case = {
  id: string;
  company_id: string;
  title: string;
  status: CaseStatus;
  priority: CasePriority;
  due_at: string | null;
  next_action: CaseNextAction;
  owner_user_id: string | null;
  participant_user_ids: string[];
  scope: CaseScope;
  mailbox_address: string | null;
  thread_id: string | null;
  customer_id: string | null;
  lead_id: string | null;
  project_id: string | null;
  offer_id: string | null;
  created_at: string;
  updated_at: string;
};

type CaseItem = {
  id: string;
  case_id: string;
  type: string;
  subject: string | null;
  from_email: string | null;
  body_preview: string | null;
  body_html: string | null;
  received_at: string | null;
  created_by: string | null;
  created_at: string;
};

type Mailbox = {
  id: string;
  address: string;
  display_name: string;
  is_enabled: boolean;
};

type FilterType = "mine" | "team" | "needs_action" | "waiting_customer" | "waiting_internal" | "converted" | "closed";

const FILTER_OPTIONS: { key: FilterType; label: string; icon: React.ElementType }[] = [
  { key: "mine", label: "Mine henvendelser", icon: UserCheck },
  { key: "team", label: "Teamets henvendelser", icon: Users },
  { key: "needs_action", label: "Krever handling", icon: AlertCircle },
  { key: "waiting_customer", label: "Avventer kunde", icon: Clock },
  { key: "waiting_internal", label: "Avventer internt", icon: Timer },
  { key: "converted", label: "Opprettet jobb", icon: CheckCircle2 },
  { key: "closed", label: "Lukket", icon: Lock },
];

const NEXT_ACTION_ICONS: Record<CaseNextAction, React.ElementType> = {
  call: Phone,
  quote: ReceiptText,
  clarify: Wrench,
  order: Package,
  schedule: CalendarDays,
  document: FileText,
  none: Clock,
};

// ─── Main Page ───────────────────────────────
export default function InboxPage() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [items, setItems] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("mine");
  const [search, setSearch] = useState("");
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<string>("all");
  const [companyUsers, setCompanyUsers] = useState<{ id: string; name: string }[]>([]);
  const [assigningTo, setAssigningTo] = useState<string | null>(null);

  const selectedCase = cases.find((c) => c.id === selectedId);
  const selectedItems = items.filter((i) => i.case_id === selectedId);

  const fetchMailboxes = useCallback(async () => {
    const { data } = await supabase.from("mailboxes").select("*").order("created_at");
    setMailboxes((data as unknown as Mailbox[]) || []);
  }, []);

  const fetchCompanyUsers = useCallback(async () => {
    const { data } = await supabase.from("technicians").select("user_id, name");
    setCompanyUsers(
      (data || []).filter((t: any) => t.user_id && t.name).map((t: any) => ({ id: t.user_id, name: t.name }))
    );
  }, []);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .not("status", "eq", "archived")
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Failed to load cases:", error);
      toast.error("Kunne ikke laste henvendelser");
    } else {
      setCases((data as unknown as Case[]) || []);
    }
    setLoading(false);
  }, []);

  const fetchItems = useCallback(async (caseId: string) => {
    const { data } = await supabase
      .from("case_items")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true });
    setItems((data as unknown as CaseItem[]) || []);
  }, []);

  useEffect(() => {
    fetchCases();
    fetchMailboxes();
    fetchCompanyUsers();
  }, [fetchCases, fetchMailboxes, fetchCompanyUsers]);

  useEffect(() => {
    if (selectedId) fetchItems(selectedId);
  }, [selectedId, fetchItems]);

  const syncInbox = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("inbox-sync");
      if (error) throw error;
      if (data?.ms_reauth) {
        toast.error("Microsoft-tilkobling må fornyes. Gå til Integrasjoner.");
        return;
      }
      toast.success(`Synkronisert! ${data?.new_cases || 0} nye henvendelser, ${data?.new_items || 0} nye meldinger.`);
      await fetchCases();
    } catch (err: any) {
      toast.error("Synkronisering feilet: " + (err.message || "Ukjent feil"));
    } finally {
      setSyncing(false);
    }
  };

  const openCase = (c: Case) => {
    setSelectedId(c.id);
    if (c.status === "new") {
      supabase.from("cases").update({ status: "triage" } as any).eq("id", c.id).then(() => {
        setCases((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "triage" as CaseStatus } : x)));
      });
    }
  };

  const assignToMe = async (c: Case) => {
    if (!user) return;
    const participants = [...(c.participant_user_ids || [])];
    if (!participants.includes(user.id)) participants.push(user.id);
    await supabase.from("cases").update({
      owner_user_id: user.id,
      participant_user_ids: participants,
      status: "assigned",
    } as any).eq("id", c.id);
    setCases((prev) => prev.map((x) => x.id === c.id ? { ...x, owner_user_id: user.id, participant_user_ids: participants, status: "assigned" as CaseStatus } : x));
    toast.success("Tildelt deg");
  };

  const assignToUser = async (c: Case, targetUserId: string) => {
    const participants = [...(c.participant_user_ids || [])];
    if (!participants.includes(targetUserId)) participants.push(targetUserId);
    await supabase.from("cases").update({
      owner_user_id: targetUserId,
      participant_user_ids: participants,
      status: "assigned",
    } as any).eq("id", c.id);
    const name = companyUsers.find((u) => u.id === targetUserId)?.name || "bruker";
    setCases((prev) => prev.map((x) => x.id === c.id ? { ...x, owner_user_id: targetUserId, participant_user_ids: participants, status: "assigned" as CaseStatus } : x));
    toast.success(`Tildelt ${name}`);
    setAssigningTo(null);
  };

  const updateCaseField = async (c: Case, updates: Partial<Case>) => {
    await supabase.from("cases").update(updates as any).eq("id", c.id);
    setCases((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...updates } : x)));
  };

  const convertToProject = (c: Case) => {
    const params = new URLSearchParams();
    params.set("fromCase", c.id);
    params.set("title", c.title);
    navigate(`/projects/new?${params.toString()}`);
  };

  const convertToLead = async (c: Case) => {
    try {
      const firstItem = items.find((i) => i.case_id === c.id && i.type === "email");
      const { data, error } = await supabase
        .from("leads")
        .insert({
          company_name: firstItem?.from_email || "Ukjent",
          contact_name: firstItem?.from_email,
          email: firstItem?.from_email,
          source: "henvendelse",
          notes: `Fra henvendelse: ${c.title}`,
          status: "new",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      await updateCaseField(c, { status: "converted" as CaseStatus, lead_id: data.id });
      toast.success("Lead opprettet!");
      navigate(`/sales/leads/${data.id}`);
    } catch (err: any) {
      toast.error("Kunne ikke opprette lead: " + (err.message || ""));
    }
  };

  // ─── Filter Logic ────────────────────────
  const filtered = cases
    .filter((c) => {
      if (selectedMailbox !== "all" && c.mailbox_address !== selectedMailbox) return false;
      switch (filter) {
        case "mine":
          return c.owner_user_id === user?.id || (c.participant_user_ids || []).includes(user?.id || "");
        case "team":
          return c.scope === "company";
        case "needs_action":
          return ["new", "triage"].includes(c.status);
        case "waiting_customer":
          return c.status === "waiting_customer";
        case "waiting_internal":
          return c.status === "waiting_internal";
        case "converted":
          return c.status === "converted";
        case "closed":
          return c.status === "closed";
      }
      return true;
    })
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return c.title.toLowerCase().includes(q) || (c.mailbox_address || "").toLowerCase().includes(q);
    });

  const statusCounts: Record<FilterType, number> = {
    mine: cases.filter((c) => c.owner_user_id === user?.id || (c.participant_user_ids || []).includes(user?.id || "")).length,
    team: cases.filter((c) => c.scope === "company").length,
    needs_action: cases.filter((c) => ["new", "triage"].includes(c.status)).length,
    waiting_customer: cases.filter((c) => c.status === "waiting_customer").length,
    waiting_internal: cases.filter((c) => c.status === "waiting_internal").length,
    converted: cases.filter((c) => c.status === "converted").length,
    closed: cases.filter((c) => c.status === "closed").length,
  };

  const ownerName = (id: string | null) => {
    if (!id) return null;
    if (id === user?.id) return "Deg";
    return companyUsers.find((u) => u.id === id)?.name || null;
  };

  // ─── KPI Dashboard ──────────────────────
  const openCount = cases.filter((c) => !["closed", "archived", "converted"].includes(c.status)).length;
  const criticalCount = cases.filter((c) => c.priority === "critical" && !["closed", "archived"].includes(c.status)).length;
  const overdueCount = cases.filter((c) => c.due_at && isPast(new Date(c.due_at)) && !["closed", "archived", "converted"].includes(c.status)).length;
  const unhandled24h = cases.filter((c) => c.status === "new" && differenceInHours(new Date(), new Date(c.created_at)) > 24).length;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* KPI Dashboard */}
      <div className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Henvendelser</h1>
              <p className="text-xs text-muted-foreground">MCS Superoffice – Kommandosentral</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedMailbox} onValueChange={setSelectedMailbox}>
              <SelectTrigger className="w-48 h-9 text-sm">
                <SelectValue placeholder="Alle postbokser" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle postbokser</SelectItem>
                {mailboxes.filter((mb) => mb.is_enabled).map((mb) => (
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

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-3">
          <KpiCard label="Åpne henvendelser" value={openCount} icon={Mail} />
          <KpiCard label="Kritiske" value={criticalCount} icon={AlertTriangle} variant={criticalCount > 0 ? "destructive" : "default"} />
          <KpiCard label="Over frist" value={overdueCount} icon={Timer} variant={overdueCount > 0 ? "warning" : "default"} />
          <KpiCard label="Ubehandlet > 24t" value={unhandled24h} icon={Clock} variant={unhandled24h > 0 ? "warning" : "default"} />
        </div>
      </div>

      {/* Main layout: filters | list | preview */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Filters */}
        <div className="w-56 shrink-0 border-r border-border bg-card p-3 space-y-1">
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

        {/* Center: Case list */}
        <div className="w-[420px] shrink-0 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Søk henvendelser..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
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
                <p className="text-sm font-medium">Ingen henvendelser</p>
                <p className="text-xs mt-1">Klikk «Synk e-post» for å hente fra postboksen</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((c) => {
                  const isOverdue = c.due_at && isPast(new Date(c.due_at)) && !["closed", "archived", "converted"].includes(c.status);
                  const ActionIcon = NEXT_ACTION_ICONS[c.next_action] || Clock;
                  return (
                    <button
                      key={c.id}
                      onClick={() => openCase(c)}
                      className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                        selectedId === c.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                      } ${c.status === "new" ? "bg-primary/[0.02]" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5">
                          {c.priority === "critical" ? (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          ) : c.status === "new" ? (
                            <Mail className="h-4 w-4 text-primary" />
                          ) : c.status === "converted" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <MailOpen className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${c.status === "new" ? "font-semibold text-foreground" : "text-foreground"}`}>
                            {c.title || "(Uten tittel)"}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${CASE_STATUS_COLOR[c.status]}`}>
                              {CASE_STATUS_LABELS[c.status]}
                            </Badge>
                            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${CASE_PRIORITY_COLOR[c.priority]}`}>
                              {CASE_PRIORITY_LABELS[c.priority]}
                            </Badge>
                            {c.next_action !== "none" && (
                              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                <ActionIcon className="h-3 w-3" />
                                {CASE_NEXT_ACTION_LABELS[c.next_action]}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(c.updated_at), { locale: nb, addSuffix: true })}
                            </span>
                            {c.owner_user_id && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {ownerName(c.owner_user_id)}
                              </Badge>
                            )}
                            {isOverdue && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                Over frist
                              </Badge>
                            )}
                            {c.mailbox_address && (
                              <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                                {c.mailbox_address}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right: Detail view */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedCase ? (
            <CaseDetail
              caseData={selectedCase}
              items={selectedItems}
              onAssignToMe={() => assignToMe(selectedCase)}
              onAssignToUser={(uid) => assignToUser(selectedCase, uid)}
              onUpdateField={(updates) => updateCaseField(selectedCase, updates)}
              onConvertProject={() => convertToProject(selectedCase)}
              onConvertLead={() => convertToLead(selectedCase)}
              companyUsers={companyUsers}
              currentUserId={user?.id || ""}
              isAdmin={isAdmin}
              ownerName={ownerName}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Building2 className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-sm font-medium">Velg en henvendelse</p>
              <p className="text-xs mt-1">Velg fra listen for å se detaljer og handlinger</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────
function KpiCard({ label, value, icon: Icon, variant = "default" }: {
  label: string;
  value: number;
  icon: React.ElementType;
  variant?: "default" | "destructive" | "warning";
}) {
  const colors = {
    default: "text-foreground",
    destructive: value > 0 ? "text-destructive" : "text-foreground",
    warning: value > 0 ? "text-orange-600" : "text-foreground",
  };
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${colors[variant]}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${colors[variant]}`}>{value}</p>
    </div>
  );
}

// ─── Case Detail ─────────────────────────────
function CaseDetail({
  caseData,
  items,
  onAssignToMe,
  onAssignToUser,
  onUpdateField,
  onConvertProject,
  onConvertLead,
  companyUsers,
  currentUserId,
  isAdmin,
  ownerName,
}: {
  caseData: Case;
  items: CaseItem[];
  onAssignToMe: () => void;
  onAssignToUser: (uid: string) => void;
  onUpdateField: (updates: Partial<Case>) => void;
  onConvertProject: () => void;
  onConvertLead: () => void;
  companyUsers: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
  ownerName: (id: string | null) => string | null;
}) {
  const navigate = useNavigate();
  const [showAssignPicker, setShowAssignPicker] = useState(false);

  return (
    <ScrollArea className="flex-1">
      <div className="p-6 space-y-5">
        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {!caseData.owner_user_id ? (
            <Button size="sm" variant="default" onClick={onAssignToMe} className="gap-1.5">
              <UserCheck className="h-4 w-4" />
              Tildel meg
            </Button>
          ) : (
            <Badge variant="secondary" className="px-3 py-1.5 text-xs">
              <UserCheck className="h-3 w-3 mr-1" />
              Tildelt: {ownerName(caseData.owner_user_id)}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowAssignPicker(!showAssignPicker)} className="gap-1.5">
            <Users className="h-4 w-4" />
            Tildel…
          </Button>
          <Badge variant="outline" className="text-xs ml-auto">
            {caseData.scope === "private" ? "Privat" : "Hele firma"}
          </Badge>
        </div>

        {showAssignPicker && (
          <Card className="p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Velg person:</p>
            <div className="flex flex-wrap gap-1.5">
              {companyUsers.map((u) => (
                <Button key={u.id} size="sm" variant="outline" className="text-xs h-7" onClick={() => { onAssignToUser(u.id); setShowAssignPicker(false); }}>
                  {u.name}
                </Button>
              ))}
            </div>
          </Card>
        )}

        {/* Title & meta */}
        <div>
          <h2 className="text-lg font-semibold text-foreground">{caseData.title || "(Uten tittel)"}</h2>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
            <Badge className={CASE_STATUS_COLOR[caseData.status]}>{CASE_STATUS_LABELS[caseData.status]}</Badge>
            <Badge className={CASE_PRIORITY_COLOR[caseData.priority]}>{CASE_PRIORITY_LABELS[caseData.priority]}</Badge>
            {caseData.due_at && (
              <span className="text-xs">
                Frist: {format(new Date(caseData.due_at), "d. MMM yyyy", { locale: nb })}
              </span>
            )}
            {caseData.mailbox_address && (
              <Badge variant="outline" className="text-xs">
                <Building2 className="h-3 w-3 mr-1" />
                {caseData.mailbox_address}
              </Badge>
            )}
          </div>
        </div>

        <Separator />

        {/* Controls: Status, Priority, Next Action, Scope */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={caseData.status} onValueChange={(v) => onUpdateField({ status: v as CaseStatus })}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_CASE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{CASE_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Prioritet</label>
            <Select value={caseData.priority} onValueChange={(v) => onUpdateField({ priority: v as CasePriority })}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_CASE_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>{CASE_PRIORITY_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Neste steg</label>
            <Select value={caseData.next_action} onValueChange={(v) => onUpdateField({ next_action: v as CaseNextAction })}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_CASE_NEXT_ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>{CASE_NEXT_ACTION_LABELS[a]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Frist</label>
            <Input
              type="date"
              value={caseData.due_at ? caseData.due_at.slice(0, 10) : ""}
              onChange={(e) => onUpdateField({ due_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className="h-9 mt-1"
            />
          </div>
        </div>

        <Separator />

        {/* Converted links */}
        {caseData.status === "converted" && (
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium text-sm">Opprettet jobb</span>
            </div>
            <div className="flex gap-2 mt-2">
              {caseData.project_id && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${caseData.project_id}`)}>
                  <FolderKanban className="h-4 w-4 mr-1" />
                  Gå til prosjekt
                </Button>
              )}
              {caseData.lead_id && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/sales/leads/${caseData.lead_id}`)}>
                  <UserPlus className="h-4 w-4 mr-1" />
                  Gå til lead
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Convert actions */}
        {!["converted", "closed", "archived"].includes(caseData.status) && (
          <Card className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Konverter</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={onConvertLead} className="gap-1.5">
                <UserPlus className="h-4 w-4" />
                Opprett lead
              </Button>
              <Button size="sm" variant="secondary" onClick={onConvertProject} className="gap-1.5">
                <FolderKanban className="h-4 w-4" />
                Opprett prosjekt
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" disabled>
                <ReceiptText className="h-4 w-4" />
                Opprett tilbud
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" disabled>
                <Wrench className="h-4 w-4" />
                Opprett serviceoppdrag
              </Button>
            </div>
          </Card>
        )}

        {/* Timeline */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Tidslinje</p>
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Ingen aktivitet ennå</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {item.type === "email" ? (
                        <Mail className="h-4 w-4 text-primary" />
                      ) : item.type === "note" ? (
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {item.subject && <p className="text-sm font-medium text-foreground">{item.subject}</p>}
                      {item.from_email && <p className="text-xs text-muted-foreground">{item.from_email}</p>}
                      {item.body_preview && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{item.body_preview}</p>
                      )}
                      {item.body_html && !item.body_preview && (
                        <div className="prose prose-sm max-w-none text-foreground mt-2" dangerouslySetInnerHTML={{ __html: item.body_html }} />
                      )}
                      <span className="text-xs text-muted-foreground mt-1 block">
                        {format(new Date(item.received_at || item.created_at), "d. MMM yyyy, HH:mm", { locale: nb })}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
