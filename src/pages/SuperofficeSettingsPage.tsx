import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Mail, Plus, Trash2, RefreshCw, CheckCircle2, AlertTriangle,
  Settings2, Shield, Zap, Activity, Clock, Search, GripVertical,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import {
  CASE_STATUS_LABELS, CASE_PRIORITY_LABELS, CASE_NEXT_ACTION_LABELS,
  ALL_CASE_STATUSES, ALL_CASE_PRIORITIES, ALL_CASE_NEXT_ACTIONS,
  type CaseStatus, type CasePriority, type CaseNextAction,
} from "@/lib/case-labels";

// ─── Types ───
type Mailbox = {
  id: string; address: string; display_name: string; is_enabled: boolean;
  graph_delta_link: string | null;
  last_sync_at: string | null; last_sync_error: string | null; last_sync_count: number | null;
};

type RoutingRule = {
  id: string; name: string; is_enabled: boolean;
  mailbox_address: string | null; from_contains: string | null;
  subject_contains: string | null; body_contains: string | null;
  priority_set: CasePriority | null; status_set: CaseStatus | null;
  next_action_set: CaseNextAction | null; owner_user_id_set: string | null;
  scope_set: string | null;
};

type SuperofficeSettings = {
  company_id: string;
  default_mailbox_address: string | null;
  catchall_mailbox_address: string | null;
  catchall_enabled: boolean;
  default_case_scope: string;
  default_case_status: string;
  default_priority: string;
  auto_triage_enabled: boolean;
  auto_assign_enabled: boolean;
  auto_assign_sales_user_id: string | null;
  auto_assign_service_user_id: string | null;
};

const SCOPE_LABELS: Record<string, string> = {
  company: "Hele firma",
  department: "Avdeling",
  project: "Prosjekt",
  private: "Privat",
};

// ─── Main Page ───
export default function SuperofficeSettingsPage() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Settings2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Superoffice – Innstillinger</h1>
          <p className="text-sm text-muted-foreground">Konfigurasjon for henvendelser, postbokser, routing og AI</p>
        </div>
      </div>

      <Tabs defaultValue="mailboxes">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="mailboxes" className="gap-1.5"><Mail className="h-3.5 w-3.5" />Postbokser</TabsTrigger>
          <TabsTrigger value="defaults" className="gap-1.5"><Shield className="h-3.5 w-3.5" />Standarder</TabsTrigger>
          <TabsTrigger value="routing" className="gap-1.5"><Zap className="h-3.5 w-3.5" />Routing & AI</TabsTrigger>
          <TabsTrigger value="health" className="gap-1.5"><Activity className="h-3.5 w-3.5" />Helse & Logg</TabsTrigger>
        </TabsList>

        <TabsContent value="mailboxes"><MailboxesTab /></TabsContent>
        <TabsContent value="defaults"><DefaultsTab /></TabsContent>
        <TabsContent value="routing"><RoutingTab /></TabsContent>
        <TabsContent value="health"><HealthTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Tab A: Postbokser
// ═══════════════════════════════════════════════
function MailboxesTab() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAddress, setNewAddress] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [defaultMb, setDefaultMb] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("mailboxes").select("*").order("created_at");
    setMailboxes((data as unknown as Mailbox[]) || []);

    const { data: companies } = await supabase.from("internal_companies").select("id").eq("is_active", true).limit(1);
    const cid = companies?.[0]?.id;
    setCompanyId(cid || null);

    if (cid) {
      const { data: settings } = await supabase
        .from("superoffice_settings")
        .select("default_mailbox_address")
        .eq("company_id", cid)
        .maybeSingle();
      setDefaultMb((settings as any)?.default_mailbox_address || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addMailbox = async () => {
    if (!newAddress.trim()) { toast.error("Skriv inn en e-postadresse"); return; }
    setAdding(true);
    const { error } = await supabase.from("mailboxes").insert({
      address: newAddress.trim().toLowerCase(),
      display_name: newDisplayName.trim() || newAddress.trim(),
      is_enabled: false,
    } as any);
    if (error) toast.error(error.message.includes("duplicate") ? "Adressen finnes allerede" : error.message);
    else { toast.success("Postboks lagt til"); setNewAddress(""); setNewDisplayName(""); fetchAll(); }
    setAdding(false);
  };

  const toggleEnabled = async (mb: Mailbox) => {
    await supabase.from("mailboxes").update({ is_enabled: !mb.is_enabled } as any).eq("id", mb.id);
    toast.success(mb.is_enabled ? "Deaktivert" : "Aktivert");
    fetchAll();
  };

  const deleteMailbox = async (mb: Mailbox) => {
    if (!confirm(`Slette postboks ${mb.address}?`)) return;
    await supabase.from("mailboxes").delete().eq("id", mb.id);
    toast.success("Slettet");
    fetchAll();
  };

  const setAsDefault = async (address: string) => {
    if (!companyId) return;
    await supabase.from("superoffice_settings").upsert({
      company_id: companyId,
      default_mailbox_address: address,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "company_id" });
    setDefaultMb(address);
    toast.success("Standard postboks satt");
  };

  const testSync = async (mb: Mailbox) => {
    setSyncing(mb.id);
    try {
      const { data, error } = await supabase.functions.invoke("inbox-sync");
      if (error) throw error;
      toast.success(`Synkronisert! ${data?.new_cases || 0} nye henvendelser`);
      fetchAll();
    } catch (err: any) {
      toast.error("Sync feilet: " + (err.message || "Ukjent feil"));
    } finally {
      setSyncing(null);
    }
  };

  if (loading) return <div className="space-y-3 pt-4">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  return (
    <div className="space-y-4 pt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aktive postbokser</CardTitle>
          <CardDescription>Administrer delte postbokser som synkroniseres til Henvendelser</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {mailboxes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Ingen postbokser konfigurert</p>
              <p className="text-xs mt-1">Legg til en postboks for å begynne å motta henvendelser</p>
            </div>
          ) : (
            mailboxes.map((mb) => (
              <div key={mb.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{mb.display_name}</p>
                    {defaultMb === mb.address && <Badge variant="outline" className="text-[10px]">Standard</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{mb.address}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    {mb.last_sync_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Sist sync: {formatDistanceToNow(new Date(mb.last_sync_at), { addSuffix: true, locale: nb })}
                      </span>
                    )}
                    {mb.last_sync_count != null && <span>{mb.last_sync_count} meldinger</span>}
                    {mb.last_sync_error && (
                      <span className="text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />Feil
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant={mb.is_enabled ? "default" : "secondary"} className="text-[10px] shrink-0">
                  {mb.is_enabled ? "Aktiv" : "Inaktiv"}
                </Badge>
                <Switch checked={mb.is_enabled} onCheckedChange={() => toggleEnabled(mb)} />
                {defaultMb !== mb.address && (
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setAsDefault(mb.address)}>
                    Sett standard
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => testSync(mb)} disabled={syncing === mb.id}>
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing === mb.id ? "animate-spin" : ""}`} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteMailbox(mb)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Legg til postboks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">E-postadresse</Label>
              <Input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="post@firma.no" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Visningsnavn</Label>
              <Input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="Hovedpostboks" />
            </div>
          </div>
          <Button size="sm" onClick={addMailbox} disabled={adding} className="mt-3 gap-1.5">
            <Plus className="h-4 w-4" />Legg til
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Tab B: Felle og standarder
// ═══════════════════════════════════════════════
function DefaultsTab() {
  const [settings, setSettings] = useState<SuperofficeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const { data: companies } = await supabase.from("internal_companies").select("id").eq("is_active", true).limit(1);
    const cid = companies?.[0]?.id;
    setCompanyId(cid || null);

    if (cid) {
      const { data } = await supabase.from("superoffice_settings").select("*").eq("company_id", cid).maybeSingle();
      setSettings((data as unknown as SuperofficeSettings) || null);
    }

    const { data: techs } = await supabase.from("technicians").select("user_id, name");
    setUsers((techs || []).filter((t: any) => t.user_id && t.name).map((t: any) => ({ id: t.user_id, name: t.name })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const save = async (updates: Partial<SuperofficeSettings>) => {
    if (!companyId) return;
    setSaving(true);
    const payload = { ...settings, ...updates, company_id: companyId, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("superoffice_settings").upsert(payload as any, { onConflict: "company_id" });
    if (error) toast.error("Lagring feilet: " + error.message);
    else { setSettings(payload as SuperofficeSettings); toast.success("Innstillinger lagret"); }
    setSaving(false);
  };

  if (loading) return <div className="space-y-3 pt-4">{[1,2].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>;

  const s = settings || {} as Partial<SuperofficeSettings>;

  return (
    <div className="space-y-4 pt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catchall / felle</CardTitle>
          <CardDescription>Fang opp e-post som ikke matcher noen konfigurert postboks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Aktiver catchall</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Rut ukjente avsendere til en felles postboks</p>
            </div>
            <Switch checked={s.catchall_enabled || false} onCheckedChange={(v) => save({ catchall_enabled: v })} />
          </div>
          {s.catchall_enabled && (
            <div className="space-y-1.5">
              <Label className="text-xs">Catchall-adresse</Label>
              <Input
                value={s.catchall_mailbox_address || ""}
                onChange={(e) => setSettings({ ...s, catchall_mailbox_address: e.target.value } as SuperofficeSettings)}
                onBlur={() => save({ catchall_mailbox_address: s.catchall_mailbox_address })}
                placeholder="catchall@firma.no"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Standardverdier for nye henvendelser</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Standard synlighet</Label>
              <Select value={s.default_case_scope || "company"} onValueChange={(v) => save({ default_case_scope: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SCOPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Standard status</Label>
              <Select value={s.default_case_status || "new"} onValueChange={(v) => save({ default_case_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_CASE_STATUSES.map((st) => <SelectItem key={st} value={st}>{CASE_STATUS_LABELS[st]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Standard prioritet</Label>
              <Select value={s.default_priority || "normal"} onValueChange={(v) => save({ default_priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_CASE_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{CASE_PRIORITY_LABELS[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automatisering</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Auto-triage</Label>
              <p className="text-xs text-muted-foreground mt-0.5">AI klassifiserer og setter prioritet/neste steg automatisk</p>
            </div>
            <Switch checked={s.auto_triage_enabled || false} onCheckedChange={(v) => save({ auto_triage_enabled: v })} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Auto-tildeling</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Tildel automatisk til riktig person basert på type</p>
            </div>
            <Switch checked={s.auto_assign_enabled || false} onCheckedChange={(v) => save({ auto_assign_enabled: v })} />
          </div>
          {s.auto_assign_enabled && (
            <div className="grid sm:grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
              <div className="space-y-1.5">
                <Label className="text-xs">Salg-henvendelser tildeles</Label>
                <Select value={s.auto_assign_sales_user_id || "none"} onValueChange={(v) => save({ auto_assign_sales_user_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Ingen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Service-henvendelser tildeles</Label>
                <Select value={s.auto_assign_service_user_id || "none"} onValueChange={(v) => save({ auto_assign_service_user_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Ingen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Tab C: Routing og AI
// ═══════════════════════════════════════════════
function RoutingTab() {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [testSubject, setTestSubject] = useState("");
  const [testBody, setTestBody] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("case_routing_rules").select("*").order("created_at");
    setRules((data as unknown as RoutingRule[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const toggleRule = async (r: RoutingRule) => {
    await supabase.from("case_routing_rules").update({ is_enabled: !r.is_enabled } as any).eq("id", r.id);
    toast.success(r.is_enabled ? "Regel deaktivert" : "Regel aktivert");
    fetchRules();
  };

  const deleteRule = async (r: RoutingRule) => {
    if (!confirm(`Slette regel "${r.name}"?`)) return;
    await supabase.from("case_routing_rules").delete().eq("id", r.id);
    toast.success("Slettet");
    fetchRules();
  };

  const runTest = () => {
    if (!testSubject && !testBody) {
      setTestResult("Skriv inn emne eller innhold for å teste");
      return;
    }
    const matches: string[] = [];
    for (const rule of rules) {
      if (!rule.is_enabled) continue;
      let matched = false;
      if (rule.subject_contains) {
        const kws = rule.subject_contains.split(",").map((k) => k.trim().toLowerCase());
        if (kws.some((kw) => testSubject.toLowerCase().includes(kw))) matched = true;
      }
      if (rule.body_contains) {
        const kws = rule.body_contains.split(",").map((k) => k.trim().toLowerCase());
        if (kws.some((kw) => testBody.toLowerCase().includes(kw) || testSubject.toLowerCase().includes(kw))) matched = true;
      }
      if (matched) {
        const effects = [];
        if (rule.priority_set) effects.push(`Prioritet → ${CASE_PRIORITY_LABELS[rule.priority_set] || rule.priority_set}`);
        if (rule.status_set) effects.push(`Status → ${CASE_STATUS_LABELS[rule.status_set] || rule.status_set}`);
        if (rule.next_action_set) effects.push(`Neste steg → ${CASE_NEXT_ACTION_LABELS[rule.next_action_set] || rule.next_action_set}`);
        matches.push(`✅ ${rule.name}: ${effects.join(", ") || "Ingen effekter"}`);
      }
    }
    setTestResult(matches.length > 0 ? matches.join("\n") : "❌ Ingen regler matchet");
  };

  if (loading) return <div className="space-y-3 pt-4">{[1,2].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  return (
    <div className="space-y-4 pt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Routing-regler</CardTitle>
          <CardDescription>Regler kjøres i rekkefølge. Alle matchende regler akkumuleres.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Ingen regler konfigurert</p>
          ) : (
            rules.map((r) => (
              <div key={r.id} className={`flex items-center gap-3 p-3 rounded-lg border ${r.is_enabled ? "border-border" : "border-border/50 opacity-60"}`}>
                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {r.subject_contains && <Badge variant="outline" className="text-[10px]">Emne: {r.subject_contains}</Badge>}
                    {r.body_contains && <Badge variant="outline" className="text-[10px]">Innhold: {r.body_contains}</Badge>}
                    {r.from_contains && <Badge variant="outline" className="text-[10px]">Fra: {r.from_contains}</Badge>}
                    {r.priority_set && <Badge className="text-[10px]">→ {CASE_PRIORITY_LABELS[r.priority_set]}</Badge>}
                    {r.status_set && <Badge className="text-[10px]">→ {CASE_STATUS_LABELS[r.status_set]}</Badge>}
                    {r.next_action_set && <Badge className="text-[10px]">→ {CASE_NEXT_ACTION_LABELS[r.next_action_set]}</Badge>}
                  </div>
                </div>
                <Switch checked={r.is_enabled} onCheckedChange={() => toggleRule(r)} />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteRule(r)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Test regler</CardTitle>
          <CardDescription>Skriv inn emne og innhold for å se hvilke regler som matcher</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Emne</Label>
              <Input value={testSubject} onChange={(e) => setTestSubject(e.target.value)} placeholder="Tilbud på tavle 400A" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Innhold</Label>
              <Input value={testBody} onChange={(e) => setTestBody(e.target.value)} placeholder="Vi trenger Schneider-bryter..." />
            </div>
          </div>
          <Button size="sm" onClick={runTest} className="gap-1.5">
            <Search className="h-4 w-4" />Test
          </Button>
          {testResult && (
            <pre className="text-xs bg-muted p-3 rounded-lg whitespace-pre-wrap font-mono">{testResult}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Tab D: Helse og logg
// ═══════════════════════════════════════════════
function HealthTab() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [caseCount, setCaseCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: mbs }, { count }] = await Promise.all([
        supabase.from("mailboxes").select("*").order("created_at"),
        supabase.from("cases").select("*", { count: "exact", head: true }).not("status", "eq", "archived"),
      ]);
      setMailboxes((mbs as unknown as Mailbox[]) || []);
      setCaseCount(count || 0);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="space-y-3 pt-4">{[1,2].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  const activeMailboxes = mailboxes.filter((m) => m.is_enabled);
  const noActiveMailboxes = activeMailboxes.length === 0;
  const staleSync = activeMailboxes.some((m) => !m.last_sync_at || (Date.now() - new Date(m.last_sync_at).getTime()) > 24 * 60 * 60 * 1000);
  const syncErrors = mailboxes.filter((m) => m.last_sync_error);
  const deltaErrors = mailboxes.filter((m) => m.is_enabled && !m.graph_delta_link);

  const warnings: { level: "warning" | "error"; message: string }[] = [];
  if (noActiveMailboxes) warnings.push({ level: "error", message: "Ingen aktive postbokser – ingen e-post synkroniseres" });
  if (staleSync) warnings.push({ level: "warning", message: "En eller flere postbokser har ikke blitt synkronisert de siste 24 timene" });
  if (syncErrors.length > 0) warnings.push({ level: "error", message: `${syncErrors.length} postboks(er) har sync-feil` });
  if (deltaErrors.length > 0) warnings.push({ level: "warning", message: `${deltaErrors.length} postboks(er) mangler delta-link (full sync neste gang)` });

  return (
    <div className="space-y-4 pt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Systemstatus</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {warnings.length === 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">Alt ser bra ut</span>
            </div>
          ) : (
            warnings.map((w, i) => (
              <div key={i} className={`flex items-center gap-2 p-3 rounded-lg ${w.level === "error" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-700"}`}>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="text-sm">{w.message}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sync-logg per postboks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {mailboxes.map((mb) => (
              <div key={mb.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{mb.display_name || mb.address}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                    <span>{mb.is_enabled ? "Aktiv" : "Inaktiv"}</span>
                    {mb.last_sync_at && <span>Sist: {format(new Date(mb.last_sync_at), "dd.MM.yyyy HH:mm", { locale: nb })}</span>}
                    {mb.last_sync_count != null && <span>{mb.last_sync_count} meldinger</span>}
                    {mb.graph_delta_link ? <span className="text-emerald-600">Delta ✓</span> : <span className="text-amber-600">Ingen delta</span>}
                  </div>
                  {mb.last_sync_error && (
                    <p className="text-[10px] text-destructive mt-0.5 truncate">{mb.last_sync_error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Oversikt</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted">
              <p className="text-2xl font-bold text-foreground">{activeMailboxes.length}</p>
              <p className="text-xs text-muted-foreground">Aktive postbokser</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted">
              <p className="text-2xl font-bold text-foreground">{caseCount}</p>
              <p className="text-xs text-muted-foreground">Aktive henvendelser</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted">
              <p className="text-2xl font-bold text-foreground">{warnings.length}</p>
              <p className="text-xs text-muted-foreground">Advarsler</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
