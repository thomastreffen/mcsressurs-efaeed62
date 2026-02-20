import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format, isPast, isToday } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { LEAD_STATUS_CONFIG, ALL_LEAD_STATUSES, NEXT_ACTION_TYPES, type LeadStatus } from "@/lib/lead-status";
import {
  ArrowLeft, Building2, User, Mail, Phone, Loader2, Save, Clock,
  AlertTriangle, Users, Plus, Trash2, FileText, ArrowRightLeft, History
} from "lucide-react";
import { toast } from "sonner";

interface Lead {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStatus;
  estimated_value: number;
  probability: number;
  expected_close_date: string | null;
  notes: string | null;
  created_at: string;
  company_id: string | null;
  assigned_owner_user_id: string | null;
  owner_id: string | null;
  next_action_type: string | null;
  next_action_date: string | null;
  next_action_note: string | null;
}

interface Participant {
  id: string;
  user_id: string;
  role: string;
  notify_enabled: boolean;
  user_name?: string;
  user_email?: string;
}

interface HistoryEntry {
  id: string;
  action: string;
  description: string | null;
  performed_by: string | null;
  created_at: string;
  performer_name?: string;
}

interface Offer {
  id: string;
  offer_number: string;
  status: string;
  version: number;
  total_ex_vat: number;
  total_inc_vat: number;
  created_at: string;
}

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [companyUsers, setCompanyUsers] = useState<{ id: string; name: string; email: string }[]>([]);

  // Edit state
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [probability, setProbability] = useState("50");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [nextActionType, setNextActionType] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [nextActionNote, setNextActionNote] = useState("");

  // Dialogs
  const [addParticipantOpen, setAddParticipantOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [convertingOfferId, setConvertingOfferId] = useState<string | null>(null);

  const fetchLead = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("leads").select("*").eq("id", id).single();
    if (!data) { navigate("/sales/leads"); return; }
    const l = data as any as Lead;
    setLead(l);
    setCompanyName(l.company_name);
    setContactName(l.contact_name || "");
    setEmail(l.email || "");
    setPhone(l.phone || "");
    setSource(l.source || "");
    setEstimatedValue(l.estimated_value ? String(l.estimated_value) : "");
    setProbability(l.probability ? String(l.probability) : "50");
    setExpectedCloseDate(l.expected_close_date || "");
    setNotes(l.notes || "");
    setNextActionType(l.next_action_type || "");
    setNextActionDate(l.next_action_date ? l.next_action_date.substring(0, 16) : "");
    setNextActionNote(l.next_action_note || "");
    setLoading(false);
  }, [id, navigate]);

  const fetchParticipants = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("lead_participants").select("*").eq("lead_id", id);
    if (!data) return;
    // Enrich with technician names
    const { data: techs } = await supabase.from("technicians").select("user_id, name, email");
    const techMap = new Map((techs || []).map((t: any) => [t.user_id, t]));
    setParticipants((data as any[]).map(p => ({
      ...p,
      user_name: techMap.get(p.user_id)?.name || "Ukjent",
      user_email: techMap.get(p.user_id)?.email || "",
    })));
  }, [id]);

  const fetchHistory = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("lead_history").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(50);
    if (!data) return;
    const { data: techs } = await supabase.from("technicians").select("user_id, name");
    const techMap = new Map((techs || []).map((t: any) => [t.user_id, t.name]));
    setHistory((data as any[]).map(h => ({
      ...h,
      performer_name: techMap.get(h.performed_by) || "System",
    })));
  }, [id]);

  const fetchOffers = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("offers").select("id, offer_number, status, version, total_ex_vat, total_inc_vat, created_at").eq("lead_id", id).order("created_at", { ascending: false });
    setOffers((data || []) as any as Offer[]);
  }, [id]);

  const fetchCompanyUsers = useCallback(async () => {
    const { data } = await supabase.from("technicians").select("user_id, name, email");
    setCompanyUsers((data || []).map((t: any) => ({ id: t.user_id, name: t.name, email: t.email })));
  }, []);

  useEffect(() => {
    fetchLead();
    fetchParticipants();
    fetchHistory();
    fetchOffers();
    fetchCompanyUsers();
  }, [fetchLead, fetchParticipants, fetchHistory, fetchOffers, fetchCompanyUsers]);

  const logHistory = async (action: string, description: string, metadata?: any) => {
    await supabase.from("lead_history").insert({
      lead_id: id!, action, description, performed_by: user?.id, metadata: metadata || {},
    });
  };

  const handleSave = async () => {
    if (!lead || !companyName.trim()) { toast.error("Firmanavn er påkrevd"); return; }
    setSaving(true);
    const payload: any = {
      company_name: companyName.trim(),
      contact_name: contactName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      source: source.trim() || null,
      estimated_value: Number(estimatedValue) || 0,
      probability: Number(probability) || 50,
      expected_close_date: expectedCloseDate || null,
      notes: notes.trim() || null,
      next_action_type: nextActionType || null,
      next_action_date: nextActionDate || null,
      next_action_note: nextActionNote.trim() || null,
    };
    await supabase.from("leads").update(payload).eq("id", lead.id);
    await logHistory("updated", "Lead oppdatert");
    toast.success("Lead lagret");
    setSaving(false);
    fetchLead();
    fetchHistory();
  };

  const handleStatusChange = async (newStatus: LeadStatus) => {
    if (!lead) return;
    const oldLabel = LEAD_STATUS_CONFIG[lead.status]?.label;
    const newLabel = LEAD_STATUS_CONFIG[newStatus]?.label;
    await supabase.from("leads").update({ status: newStatus }).eq("id", lead.id);
    await logHistory("status_changed", `Status endret fra ${oldLabel} til ${newLabel}`, { from: lead.status, to: newStatus });
    // Notify participants
    await notifyParticipants(`Status endret til ${newLabel}`, `Lead "${lead.company_name}" fikk ny status: ${newLabel}`);
    toast.success(`Status endret til ${newLabel}`);
    setLead({ ...lead, status: newStatus });
    fetchHistory();
  };

  const handleOwnerChange = async (newOwnerId: string) => {
    if (!lead) return;
    await supabase.from("leads").update({ assigned_owner_user_id: newOwnerId, owner_id: newOwnerId }).eq("id", lead.id);
    // Ensure owner is participant
    await supabase.from("lead_participants").upsert({ lead_id: lead.id, user_id: newOwnerId, role: "owner" }, { onConflict: "lead_id,user_id" });
    const ownerName = companyUsers.find(u => u.id === newOwnerId)?.name || "Ukjent";
    await logHistory("owner_changed", `Eier endret til ${ownerName}`, { new_owner: newOwnerId });
    await notifyParticipants(`Ny eier: ${ownerName}`, `Lead "${lead.company_name}" fikk ny eier: ${ownerName}`);
    toast.success("Eier endret");
    fetchLead();
    fetchParticipants();
    fetchHistory();
  };

  const addParticipant = async () => {
    if (!selectedUserId || !lead) return;
    const { error } = await supabase.from("lead_participants").insert({ lead_id: lead.id, user_id: selectedUserId, role: "contributor" });
    if (error) { toast.error("Kunne ikke legge til deltaker"); return; }
    const userName = companyUsers.find(u => u.id === selectedUserId)?.name || "Ukjent";
    await logHistory("participant_added", `${userName} lagt til som deltaker`);
    toast.success("Deltaker lagt til");
    setAddParticipantOpen(false);
    setSelectedUserId("");
    fetchParticipants();
    fetchHistory();
  };

  const removeParticipant = async (p: Participant) => {
    if (p.role === "owner") { toast.error("Kan ikke fjerne eier"); return; }
    await supabase.from("lead_participants").delete().eq("id", p.id);
    await logHistory("participant_removed", `${p.user_name} fjernet som deltaker`);
    toast.success("Deltaker fjernet");
    fetchParticipants();
    fetchHistory();
  };

  const notifyParticipants = async (title: string, message: string) => {
    const toNotify = participants.filter(p => p.notify_enabled && p.user_id !== user?.id);
    if (toNotify.length === 0) return;
    const rows = toNotify.map(p => ({ user_id: p.user_id, title, message, type: "lead_update" }));
    await supabase.from("notifications").insert(rows);
  };

  const handleConvertToProject = async () => {
    if (!lead || !convertingOfferId) return;
    const offer = offers.find(o => o.id === convertingOfferId);
    if (!offer) return;

    const { data, error } = await supabase.from("events").insert({
      title: `Prosjekt - ${lead.company_name}`,
      customer: lead.company_name,
      description: lead.notes || null,
      company_id: lead.company_id,
      lead_id: lead.id,
      offer_id: convertingOfferId,
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 8 * 3600000).toISOString(),
      technician_id: (await supabase.from("technicians").select("id").eq("user_id", user!.id).single()).data?.id || "",
      created_by: user!.id,
      status: "scheduled",
    } as any).select("id").single();

    if (error) { toast.error("Feil ved konvertering", { description: error.message }); return; }

    // Copy participants to job_participants
    for (const p of participants) {
      await supabase.from("job_participants").insert({ job_id: data!.id, user_id: p.user_id, role_label: p.role });
    }

    // Update lead status
    await supabase.from("leads").update({ status: "won" as LeadStatus }).eq("id", lead.id);

    await logHistory("converted_to_project", `Konvertert til prosjekt`, { job_id: data!.id, offer_id: convertingOfferId });
    await notifyParticipants("Lead konvertert", `Lead "${lead.company_name}" er konvertert til prosjekt.`);

    toast.success("Lead konvertert til prosjekt");
    setConvertDialogOpen(false);
    navigate(`/jobs/${data!.id}`);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!lead) return null;

  const isOverdue = lead.next_action_date && isPast(new Date(lead.next_action_date)) && !isToday(new Date(lead.next_action_date));
  const acceptedOffers = offers.filter(o => o.status === "accepted");

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/sales/leads")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-bold">{lead.company_name}</h1>
          <p className="text-sm text-muted-foreground">
            Opprettet {format(new Date(lead.created_at), "d. MMM yyyy", { locale: nb })}
          </p>
        </div>
        <Select value={lead.status} onValueChange={(v) => handleStatusChange(v as LeadStatus)}>
          <SelectTrigger className="w-auto h-9">
            <Badge className={LEAD_STATUS_CONFIG[lead.status]?.className}>
              {LEAD_STATUS_CONFIG[lead.status]?.label}
            </Badge>
          </SelectTrigger>
          <SelectContent>
            {ALL_LEAD_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{LEAD_STATUS_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Next Action Banner */}
      {lead.next_action_date && (
        <Card className={isOverdue ? "border-destructive bg-destructive/5" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800"}>
          <CardContent className="flex items-center gap-3 py-3">
            {isOverdue ? <AlertTriangle className="h-5 w-5 text-destructive shrink-0" /> : <Clock className="h-5 w-5 text-amber-600 shrink-0" />}
            <div className="flex-1">
              <p className="text-sm font-medium">
                {isOverdue ? "Forfalt: " : "Neste aksjon: "}
                {NEXT_ACTION_TYPES.find(t => t.key === lead.next_action_type)?.label || lead.next_action_type}
                {" — "}
                {format(new Date(lead.next_action_date), "d. MMM yyyy HH:mm", { locale: nb })}
              </p>
              {lead.next_action_note && <p className="text-xs text-muted-foreground">{lead.next_action_note}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Oversikt</TabsTrigger>
          <TabsTrigger value="participants">Deltakere ({participants.length})</TabsTrigger>
          <TabsTrigger value="offers">Tilbud ({offers.length})</TabsTrigger>
          <TabsTrigger value="history">Historikk</TabsTrigger>
        </TabsList>

        {/* --- INFO TAB --- */}
        <TabsContent value="info" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Kontaktinfo</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Firmanavn *</Label>
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Kontaktperson</Label>
                  <Input value={contactName} onChange={e => setContactName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>E-post</Label>
                    <Input value={email} onChange={e => setEmail(e.target.value)} type="email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telefon</Label>
                    <Input value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Kilde</Label>
                  <Input value={source} onChange={e => setSource(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Salgsinfo</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Eier</Label>
                  <Select value={lead.assigned_owner_user_id || ""} onValueChange={handleOwnerChange}>
                    <SelectTrigger><SelectValue placeholder="Velg eier" /></SelectTrigger>
                    <SelectContent>
                      {companyUsers.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Estimert verdi (kr)</Label>
                    <Input value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} type="number" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sannsynlighet (%)</Label>
                    <Input value={probability} onChange={e => setProbability(e.target.value)} type="number" min="0" max="100" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Forventet lukkedato</Label>
                  <Input value={expectedCloseDate} onChange={e => setExpectedCloseDate(e.target.value)} type="date" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Next Action */}
          <Card>
            <CardHeader><CardTitle className="text-base">Neste aksjon</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={nextActionType || "__none__"} onValueChange={v => setNextActionType(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Velg type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Ingen</SelectItem>
                      {NEXT_ACTION_TYPES.map(t => (
                        <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Dato og tid</Label>
                  <Input value={nextActionDate} onChange={e => setNextActionDate(e.target.value)} type="datetime-local" />
                </div>
                <div className="space-y-1.5">
                  <Label>Notat</Label>
                  <Input value={nextActionNote} onChange={e => setNextActionNote(e.target.value)} placeholder="Kort beskrivelse..." />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader><CardTitle className="text-base">Notater</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Interne notater..." />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Lagre endringer
            </Button>
          </div>
        </TabsContent>

        {/* --- PARTICIPANTS TAB --- */}
        <TabsContent value="participants" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Deltakere</h3>
            <Button size="sm" className="gap-1.5" onClick={() => setAddParticipantOpen(true)}>
              <Plus className="h-4 w-4" /> Legg til
            </Button>
          </div>
          <div className="space-y-2">
            {participants.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Ingen deltakere ennå</p>
            ) : participants.map(p => (
              <Card key={p.id}>
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.user_name}</p>
                    <p className="text-xs text-muted-foreground">{p.user_email}</p>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">{p.role === "owner" ? "Eier" : p.role === "contributor" ? "Bidragsyter" : "Leser"}</Badge>
                  {p.role !== "owner" && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeParticipant(p)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* --- OFFERS TAB --- */}
        <TabsContent value="offers" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Tilbud knyttet til denne leaden</h3>
          </div>
          {offers.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Ingen tilbud ennå
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {offers.map(offer => (
                <Card key={offer.id}>
                  <CardContent className="flex items-center gap-3 py-3">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{offer.offer_number} (v{offer.version})</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(offer.created_at), "d. MMM yyyy", { locale: nb })}
                        {" · "}
                        kr {Number(offer.total_ex_vat).toLocaleString("nb-NO")} eks. mva
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs capitalize">{offer.status}</Badge>
                    {offer.status === "accepted" && (
                      <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => {
                        setConvertingOfferId(offer.id);
                        setConvertDialogOpen(true);
                      }}>
                        <ArrowRightLeft className="h-3 w-3" /> Konverter
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* --- HISTORY TAB --- */}
        <TabsContent value="history" className="space-y-4">
          <h3 className="font-semibold">Historikk</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Ingen hendelser loggført</p>
          ) : (
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.id} className="flex gap-3 text-sm">
                  <div className="pt-1"><History className="h-4 w-4 text-muted-foreground" /></div>
                  <div className="flex-1">
                    <p>{h.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.performer_name} · {format(new Date(h.created_at), "d. MMM yyyy HH:mm", { locale: nb })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Participant Dialog */}
      <Dialog open={addParticipantOpen} onOpenChange={setAddParticipantOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Legg til deltaker</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Bruker</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger><SelectValue placeholder="Velg bruker" /></SelectTrigger>
              <SelectContent>
                {companyUsers
                  .filter(u => !participants.some(p => p.user_id === u.id))
                  .map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddParticipantOpen(false)}>Avbryt</Button>
            <Button onClick={addParticipant} disabled={!selectedUserId}>Legg til</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert to Project Dialog */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Konverter til prosjekt</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Dette oppretter et nytt prosjekt fra lead "{lead.company_name}" med det aksepterte tilbudet.
            Deltakere kopieres til prosjektet.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleConvertToProject} className="gap-1.5">
              <ArrowRightLeft className="h-4 w-4" /> Konverter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
