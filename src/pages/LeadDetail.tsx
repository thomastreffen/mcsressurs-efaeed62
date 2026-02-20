import { useState, useEffect, useCallback, Component, type ReactNode, type ErrorInfo } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { LEAD_STATUS_CONFIG, ALL_LEAD_STATUSES, NEXT_ACTION_TYPES, type LeadStatus } from "@/lib/lead-status";
import {
  ArrowLeft, User, Loader2, Save, Clock,
  AlertTriangle, Plus, Trash2, FileText, ArrowRightLeft, History, ShieldAlert,
  Copy, Mail, CalendarPlus, RefreshCw, ExternalLink, Calendar as CalendarIcon
} from "lucide-react";
import { toast } from "sonner";

// ─── Error Boundary ───
class LeadDetailErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[LeadDetail] Render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-md p-8 text-center space-y-4">
          <ShieldAlert className="h-12 w-12 mx-auto text-destructive opacity-60" />
          <h2 className="text-lg font-semibold">Kunne ikke laste lead-detaljer</h2>
          <p className="text-sm text-muted-foreground">
            Prøv å oppdatere siden. Hvis problemet vedvarer, kontakt admin.
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>Oppdater siden</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Types ───
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
  lead_ref_code: string | null;
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

interface CalendarLink {
  id: string;
  lead_id: string;
  outlook_event_id: string;
  event_subject: string | null;
  event_start: string | null;
  event_end: string | null;
  event_location: string | null;
  created_at: string;
  last_synced_at: string | null;
}

// ─── Inner Component ───
function LeadDetailInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [calendarLinks, setCalendarLinks] = useState<CalendarLink[]>([]);
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

  // Meeting dialog
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [meetingStart, setMeetingStart] = useState("");
  const [meetingDuration, setMeetingDuration] = useState("60");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [meetingSubject, setMeetingSubject] = useState("Befaring");
  const [meetingAttendees, setMeetingAttendees] = useState<string[]>([]);
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  // Email draft
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [msReauthNeeded, setMsReauthNeeded] = useState(false);

  const fetchLead = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase.from("leads").select("*").eq("id", id).single();
      if (error || !data) {
        console.warn("[LeadDetail] Lead not found or access denied:", error?.message);
        setNotFound(true);
        setLoading(false);
        return;
      }
      const l = data as any as Lead;
      if (!LEAD_STATUS_CONFIG[l.status]) l.status = "new";
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
    } catch (err) {
      console.error("[LeadDetail] Fetch error:", err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchParticipants = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await supabase.from("lead_participants").select("*").eq("lead_id", id);
      if (!data) return;
      const { data: techs } = await supabase.from("technicians").select("user_id, name, email");
      const techMap = new Map((techs || []).map((t: any) => [t.user_id, t]));
      setParticipants((data as any[]).filter(p => p.id && p.user_id).map(p => ({
        ...p,
        user_name: techMap.get(p.user_id)?.name || "Ukjent bruker",
        user_email: techMap.get(p.user_id)?.email || "",
      })));
    } catch (err) {
      console.warn("[LeadDetail] Participants fetch error:", err);
    }
  }, [id]);

  const fetchHistory = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await supabase.from("lead_history").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(50);
      if (!data) return;
      const { data: techs } = await supabase.from("technicians").select("user_id, name");
      const techMap = new Map((techs || []).map((t: any) => [t.user_id, t.name]));
      setHistory((data as any[]).map(h => ({
        ...h,
        performer_name: techMap.get(h.performed_by) || "System",
      })));
    } catch (err) {
      console.warn("[LeadDetail] History fetch error:", err);
    }
  }, [id]);

  const fetchOffers = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await supabase.from("offers").select("id, offer_number, status, version, total_ex_vat, total_inc_vat, created_at").eq("lead_id", id).order("created_at", { ascending: false });
      setOffers((data || []) as any as Offer[]);
    } catch (err) {
      console.warn("[LeadDetail] Offers fetch error:", err);
    }
  }, [id]);

  const fetchCalendarLinks = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await supabase.from("lead_calendar_links").select("*").eq("lead_id", id).order("event_start", { ascending: false });
      setCalendarLinks((data || []) as any as CalendarLink[]);
    } catch (err) {
      console.warn("[LeadDetail] Calendar links fetch error:", err);
    }
  }, [id]);

  const fetchCompanyUsers = useCallback(async () => {
    try {
      const { data } = await supabase.from("technicians").select("user_id, name, email");
      setCompanyUsers((data || []).filter((t: any) => t.user_id && t.name).map((t: any) => ({ id: t.user_id, name: t.name, email: t.email })));
    } catch (err) {
      console.warn("[LeadDetail] Company users fetch error:", err);
    }
  }, []);

  useEffect(() => {
    fetchLead();
    fetchParticipants();
    fetchHistory();
    fetchOffers();
    fetchCalendarLinks();
    fetchCompanyUsers();
  }, [fetchLead, fetchParticipants, fetchHistory, fetchOffers, fetchCalendarLinks, fetchCompanyUsers]);

  const logHistory = async (action: string, description: string, metadata?: any) => {
    try {
      await supabase.from("lead_history").insert({
        lead_id: id!, action, description, performed_by: user?.id, metadata: metadata || {},
      });
    } catch (err) {
      console.warn("[LeadDetail] Log history error:", err);
    }
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
    const oldLabel = LEAD_STATUS_CONFIG[lead.status]?.label || lead.status;
    const newLabel = LEAD_STATUS_CONFIG[newStatus]?.label || newStatus;
    await supabase.from("leads").update({ status: newStatus }).eq("id", lead.id);
    await logHistory("status_changed", `Status endret fra ${oldLabel} til ${newLabel}`, { from: lead.status, to: newStatus });
    await notifyParticipants(`Status endret til ${newLabel}`, `Lead "${lead.company_name}" fikk ny status: ${newLabel}`);
    toast.success(`Status endret til ${newLabel}`);
    setLead({ ...lead, status: newStatus });
    fetchHistory();
  };

  const handleOwnerChange = async (newOwnerId: string) => {
    if (!lead || newOwnerId === "__unset__") return;
    await supabase.from("leads").update({ assigned_owner_user_id: newOwnerId, owner_id: newOwnerId }).eq("id", lead.id);
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

    const techRes = await supabase.from("technicians").select("id").eq("user_id", user!.id).single();
    if (!techRes.data?.id) { toast.error("Finner ikke montørprofil for innlogget bruker"); return; }

    const { data, error } = await supabase.from("events").insert({
      title: `Prosjekt - ${lead.company_name}`,
      customer: lead.company_name,
      description: lead.notes || null,
      company_id: lead.company_id,
      lead_id: lead.id,
      offer_id: convertingOfferId,
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 8 * 3600000).toISOString(),
      technician_id: techRes.data.id,
      created_by: user!.id,
      status: "scheduled",
    } as any).select("id").single();

    if (error) { toast.error("Feil ved konvertering", { description: error.message }); return; }

    for (const p of participants) {
      await supabase.from("job_participants").insert({ job_id: data!.id, user_id: p.user_id, role_label: p.role });
    }

    await supabase.from("leads").update({ status: "won" as LeadStatus }).eq("id", lead.id);
    await logHistory("converted_to_project", `Konvertert til prosjekt`, { job_id: data!.id, offer_id: convertingOfferId });
    await notifyParticipants("Lead konvertert", `Lead "${lead.company_name}" er konvertert til prosjekt.`);

    toast.success("Lead konvertert til prosjekt");
    setConvertDialogOpen(false);
    navigate(`/jobs/${data!.id}`);
  };

  // ─── Re-auth Microsoft ───
  const handleMsReauth = () => {
    const AZURE_CLIENT_ID = "f5605c08-b986-4626-9dec-e1446fd13702";
    const AZURE_TENANT_ID = "e1b96c2a-c273-40b9-bb46-a2a7b570e133";
    const redirectUri = `${window.location.origin}/auth/callback`;
    const scope = encodeURIComponent(
      "openid profile email User.Read Calendars.ReadWrite User.Read.All Mail.ReadWrite offline_access"
    );
    window.location.href =
      `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/authorize` +
      `?client_id=${AZURE_CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scope}` +
      `&response_mode=query` +
      `&prompt=consent`;
  };

  // ─── Email Draft ───
  const handleCreateEmailDraft = async () => {
    if (!lead) return;
    if (!lead.email) { toast.error("Lead har ingen e-postadresse"); return; }
    setCreatingDraft(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-lead-email-draft", {
        body: { lead_id: lead.id },
      });
      if (error) throw error;
      if (data?.ms_reauth) {
        setMsReauthNeeded(true);
        toast.error(data.error || "Microsoft-tilkobling må fornyes");
        return;
      }
      if (data?.error) { toast.error(data.error); return; }
      setMsReauthNeeded(false);
      toast.success("E-postutkast opprettet i Outlook");
      if (data?.web_link) {
        window.open(data.web_link, "_blank");
      }
      fetchHistory();
    } catch (err: any) {
      console.error("[LeadDetail] Email draft error:", err);
      toast.error("Kunne ikke opprette e-postutkast");
    } finally {
      setCreatingDraft(false);
    }
  };

  // ─── Create Meeting ───
  const handleCreateMeeting = async () => {
    if (!lead || !meetingStart) { toast.error("Velg dato og tid"); return; }
    setCreatingMeeting(true);
    try {
      const durationMs = Number(meetingDuration) * 60 * 1000;
      const startDate = new Date(meetingStart);
      const endDate = new Date(startDate.getTime() + durationMs);

      const { data, error } = await supabase.functions.invoke("lead-calendar-event", {
        body: {
          action: "create",
          lead_id: lead.id,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          location: meetingLocation || null,
          attendee_emails: meetingAttendees,
          subject_suffix: meetingSubject || "Befaring",
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success("Møte opprettet i Outlook");
      if (data?.web_link) {
        window.open(data.web_link, "_blank");
      }
      setMeetingDialogOpen(false);
      fetchCalendarLinks();
      fetchHistory();
    } catch (err: any) {
      console.error("[LeadDetail] Create meeting error:", err);
      toast.error("Kunne ikke opprette møte");
    } finally {
      setCreatingMeeting(false);
    }
  };

  // ─── Delete Calendar Link ───
  const handleDeleteCalendarLink = async (linkId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("lead-calendar-event", {
        body: { action: "delete", link_id: linkId },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success("Møte slettet fra Outlook");
      fetchCalendarLinks();
      fetchHistory();
    } catch (err) {
      console.error("[LeadDetail] Delete calendar link error:", err);
      toast.error("Kunne ikke slette møte");
    }
  };

  // ─── Resync Calendar Link ───
  const handleResyncCalendarLink = async (linkId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("lead-calendar-event", {
        body: { action: "resync", link_id: linkId },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success("Møte resynkronisert");
      fetchCalendarLinks();
    } catch (err) {
      console.error("[LeadDetail] Resync error:", err);
      toast.error("Kunne ikke resynkronisere");
    }
  };

  // ─── Copy ref code ───
  const copyRefCode = () => {
    if (lead?.lead_ref_code) {
      navigator.clipboard.writeText(lead.lead_ref_code);
      toast.success("Referansekode kopiert");
    }
  };

  // ─── Loading state ───
  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (notFound || !lead) {
    return (
      <div className="mx-auto max-w-md p-8 text-center space-y-4">
        <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground opacity-60" />
        <h2 className="text-lg font-semibold">Lead ikke funnet</h2>
        <p className="text-sm text-muted-foreground">
          Du har ikke tilgang til denne leaden, eller den finnes ikke.
        </p>
        <Button variant="outline" onClick={() => navigate("/sales/leads")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbake til leads
        </Button>
      </div>
    );
  }

  const safeStatus = LEAD_STATUS_CONFIG[lead.status] ? lead.status : "new";
  const isOverdue = lead.next_action_date && isPast(new Date(lead.next_action_date)) && !isToday(new Date(lead.next_action_date));
  const ownerSelectValue = lead.assigned_owner_user_id && companyUsers.some(u => u.id === lead.assigned_owner_user_id)
    ? lead.assigned_owner_user_id
    : "__unset__";

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
      {/* MS Reauth Banner */}
      {msReauthNeeded && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Microsoft-tilkobling må fornyes</p>
            <p className="text-xs text-muted-foreground">Manglende rettigheter (Mail.ReadWrite). Logg inn på nytt for å gi tilgang.</p>
          </div>
          <Button size="sm" variant="destructive" onClick={handleMsReauth}>
            Koble til Microsoft på nytt
          </Button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/sales/leads")} className="mt-1">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">{lead.company_name}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {lead.lead_ref_code && (
              <button
                onClick={copyRefCode}
                className="inline-flex items-center gap-1 text-xs font-mono bg-muted px-2 py-0.5 rounded hover:bg-muted/80 transition-colors"
                title="Klikk for å kopiere"
              >
                {lead.lead_ref_code}
                <Copy className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
            <span className="text-sm text-muted-foreground">
              Opprettet {format(new Date(lead.created_at), "d. MMM yyyy", { locale: nb })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 hidden sm:flex"
            disabled={creatingDraft || !lead.email}
            onClick={handleCreateEmailDraft}
            title={!lead.email ? "Lead har ingen e-postadresse" : ""}
          >
            {creatingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            E-post
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 hidden sm:flex"
            onClick={() => {
              setMeetingStart("");
              setMeetingDuration("60");
              setMeetingLocation("");
              setMeetingSubject("Befaring");
              setMeetingAttendees(participants.filter(p => p.user_email).map(p => p.user_email!));
              setMeetingDialogOpen(true);
            }}
          >
            <CalendarPlus className="h-4 w-4" /> Møte
          </Button>
          <Select value={safeStatus} onValueChange={(v) => handleStatusChange(v as LeadStatus)}>
            <SelectTrigger className="w-auto h-9">
              <Badge className={LEAD_STATUS_CONFIG[safeStatus]?.className}>
                {LEAD_STATUS_CONFIG[safeStatus]?.label}
              </Badge>
            </SelectTrigger>
            <SelectContent>
              {ALL_LEAD_STATUSES.map(s => (
                <SelectItem key={s} value={s}>{LEAD_STATUS_CONFIG[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mobile action buttons */}
      <div className="flex gap-2 sm:hidden">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 flex-1"
          disabled={creatingDraft || !lead.email}
          onClick={handleCreateEmailDraft}
        >
          {creatingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Ny e-post
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 flex-1"
          onClick={() => {
            setMeetingStart("");
            setMeetingDuration("60");
            setMeetingLocation("");
            setMeetingSubject("Befaring");
            setMeetingAttendees(participants.filter(p => p.user_email).map(p => p.user_email!));
            setMeetingDialogOpen(true);
          }}
        >
          <CalendarPlus className="h-4 w-4" /> Opprett møte
        </Button>
      </div>

      {/* Next Action Banner */}
      {lead.next_action_date && (
        <Card className={isOverdue ? "border-destructive bg-destructive/5" : ""}>
          <CardContent className="flex items-center gap-3 py-3">
            {isOverdue ? <AlertTriangle className="h-5 w-5 text-destructive shrink-0" /> : <Clock className="h-5 w-5 text-muted-foreground shrink-0" />}
            <div className="flex-1">
              <p className="text-sm font-medium">
                {isOverdue ? "Forfalt: " : "Neste aksjon: "}
                {NEXT_ACTION_TYPES.find(t => t.key === lead.next_action_type)?.label || lead.next_action_type || "Ukjent"}
                {" — "}
                {format(new Date(lead.next_action_date), "d. MMM yyyy HH:mm", { locale: nb })}
              </p>
              {lead.next_action_note && <p className="text-xs text-muted-foreground">{lead.next_action_note}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="info">Oversikt</TabsTrigger>
          <TabsTrigger value="participants">Deltakere ({participants.length})</TabsTrigger>
          <TabsTrigger value="offers">Tilbud ({offers.length})</TabsTrigger>
          <TabsTrigger value="calendar">Møter ({calendarLinks.length})</TabsTrigger>
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
                  <Select value={ownerSelectValue} onValueChange={handleOwnerChange}>
                    <SelectTrigger><SelectValue placeholder="Velg eier" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset__">Ikke satt</SelectItem>
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

        {/* --- CALENDAR / MEETINGS TAB --- */}
        <TabsContent value="calendar" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Outlook-møter</h3>
            <Button size="sm" className="gap-1.5" onClick={() => {
              setMeetingStart("");
              setMeetingDuration("60");
              setMeetingLocation("");
              setMeetingSubject("Befaring");
              setMeetingAttendees(participants.filter(p => p.user_email).map(p => p.user_email!));
              setMeetingDialogOpen(true);
            }}>
              <CalendarPlus className="h-4 w-4" /> Nytt møte
            </Button>
          </div>
          {calendarLinks.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">
              <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Ingen møter opprettet ennå
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {calendarLinks.map(link => (
                <Card key={link.id}>
                  <CardContent className="flex items-center gap-3 py-3">
                    <CalendarIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{link.event_subject || "Ukjent møte"}</p>
                      <p className="text-xs text-muted-foreground">
                        {link.event_start ? format(new Date(link.event_start), "d. MMM yyyy HH:mm", { locale: nb }) : "—"}
                        {link.event_end ? ` – ${format(new Date(link.event_end), "HH:mm", { locale: nb })}` : ""}
                        {link.event_location ? ` · ${link.event_location}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleResyncCalendarLink(link.id)}
                        title="Resynkroniser"
                      >
                        <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDeleteCalendarLink(link.id)}
                        title="Slett fra Outlook"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
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
          <DialogHeader>
            <DialogTitle>Legg til deltaker</DialogTitle>
            <DialogDescription>Velg en bruker å legge til som deltaker på denne leaden.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Bruker</Label>
            {companyUsers.filter(u => !participants.some(p => p.user_id === u.id)).length > 0 ? (
              <Select value={selectedUserId || "__pick__"} onValueChange={v => setSelectedUserId(v === "__pick__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Velg bruker" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__pick__">Velg bruker...</SelectItem>
                  {companyUsers
                    .filter(u => !participants.some(p => p.user_id === u.id))
                    .map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">Alle tilgjengelige brukere er allerede lagt til.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddParticipantOpen(false)}>Avbryt</Button>
            <Button onClick={addParticipant} disabled={!selectedUserId || selectedUserId === "__pick__"}>Legg til</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert to Project Dialog */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Konverter til prosjekt</DialogTitle>
            <DialogDescription>
              Dette oppretter et nytt prosjekt fra lead &quot;{lead.company_name}&quot; med det aksepterte tilbudet.
              Deltakere kopieres til prosjektet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleConvertToProject} className="gap-1.5">
              <ArrowRightLeft className="h-4 w-4" /> Konverter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Meeting Dialog */}
      <Dialog open={meetingDialogOpen} onOpenChange={setMeetingDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Opprett befaring / møte</DialogTitle>
            <DialogDescription>
              Oppretter en Outlook-kalenderinvitasjon med lead-referansen {lead.lead_ref_code || ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Type / tittel</Label>
              <Select value={meetingSubject || "__befaring__"} onValueChange={v => setMeetingSubject(v === "__befaring__" ? "Befaring" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Befaring">Befaring</SelectItem>
                  <SelectItem value="Møte">Møte</SelectItem>
                  <SelectItem value="Oppfølging">Oppfølging</SelectItem>
                  <SelectItem value="Presentasjon">Presentasjon</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dato og tid *</Label>
                <Input type="datetime-local" value={meetingStart} onChange={e => setMeetingStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Varighet (min)</Label>
                <Select value={meetingDuration} onValueChange={setMeetingDuration}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="60">1 time</SelectItem>
                    <SelectItem value="90">1,5 timer</SelectItem>
                    <SelectItem value="120">2 timer</SelectItem>
                    <SelectItem value="180">3 timer</SelectItem>
                    <SelectItem value="240">4 timer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Sted</Label>
              <Input value={meetingLocation} onChange={e => setMeetingLocation(e.target.value)} placeholder="Adresse eller lokasjon..." />
            </div>
            <div className="space-y-1.5">
              <Label>Deltakere (e-post)</Label>
              <div className="space-y-1.5">
                {meetingAttendees.map((email, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={email}
                      onChange={e => {
                        const updated = [...meetingAttendees];
                        updated[idx] = e.target.value;
                        setMeetingAttendees(updated);
                      }}
                      placeholder="e-post@example.com"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setMeetingAttendees(meetingAttendees.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={() => setMeetingAttendees([...meetingAttendees, ""])}
                >
                  <Plus className="h-3 w-3" /> Legg til deltaker
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMeetingDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleCreateMeeting} disabled={creatingMeeting || !meetingStart} className="gap-1.5">
              {creatingMeeting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Opprett møte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Export with Error Boundary ───
export default function LeadDetail() {
  return (
    <LeadDetailErrorBoundary>
      <LeadDetailInner />
    </LeadDetailErrorBoundary>
  );
}
