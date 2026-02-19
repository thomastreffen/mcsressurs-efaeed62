import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { LEAD_STATUS_CONFIG, ALL_LEAD_STATUSES, type LeadStatus } from "@/lib/lead-status";
import { Search, Plus, Loader2, Building2, User, Mail, Phone, ArrowRightLeft } from "lucide-react";
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
}

export default function LeadsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [probability, setProbability] = useState("50");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [notes, setNotes] = useState("");

  const fetchLeads = async () => {
    setLoading(true);
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    setLeads((data || []) as Lead[]);
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, []);

  const resetForm = () => {
    setCompanyName(""); setContactName(""); setEmail(""); setPhone("");
    setSource(""); setEstimatedValue(""); setProbability("50"); setExpectedCloseDate(""); setNotes(""); setEditLead(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (lead: Lead) => {
    setEditLead(lead);
    setCompanyName(lead.company_name);
    setContactName(lead.contact_name || "");
    setEmail(lead.email || "");
    setPhone(lead.phone || "");
    setSource(lead.source || "");
    setEstimatedValue(lead.estimated_value ? String(lead.estimated_value) : "");
    setProbability(lead.probability ? String(lead.probability) : "50");
    setExpectedCloseDate(lead.expected_close_date || "");
    setNotes(lead.notes || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!companyName.trim()) { toast.error("Firmanavn er påkrevd"); return; }
    setSaving(true);
    const payload = {
      company_name: companyName.trim(),
      contact_name: contactName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      source: source.trim() || null,
      estimated_value: Number(estimatedValue) || 0,
      probability: Number(probability) || 50,
      expected_close_date: expectedCloseDate || null,
      notes: notes.trim() || null,
    };

    if (editLead) {
      await supabase.from("leads").update(payload).eq("id", editLead.id);
      toast.success("Lead oppdatert");
    } else {
      const { data } = await supabase.from("leads").insert({ ...payload, owner_id: user?.id }).select("id").single();
      if (data) {
        await supabase.from("activity_log").insert({
          entity_type: "lead", entity_id: data.id, action: "created",
          description: `Lead opprettet: ${companyName.trim()}`, performed_by: user?.id,
        });
      }
      toast.success("Lead opprettet");
    }
    setSaving(false);
    setDialogOpen(false);
    resetForm();
    fetchLeads();
  };

  const handleConvertToCalculation = async (lead: Lead) => {
    const { data, error } = await supabase.from("calculations").insert({
      customer_name: lead.company_name,
      customer_email: lead.email,
      project_title: `Prosjekt - ${lead.company_name}`,
      description: lead.notes || null,
      created_by: user!.id,
      lead_id: lead.id,
    }).select("id").single();

    if (error) { toast.error("Kunne ikke konvertere", { description: error.message }); return; }

    await supabase.from("leads").update({ status: "qualified" as LeadStatus }).eq("id", lead.id);
    await supabase.from("activity_log").insert({
      entity_type: "lead", entity_id: lead.id, action: "converted_to_calculation",
      description: `Konvertert til kalkulasjon`, performed_by: user?.id,
      metadata: { calculation_id: data.id },
    });
    toast.success("Lead konvertert til kalkulasjon");
    navigate(`/calculations/${data.id}`);
  };

  const handleStatusChange = async (leadId: string, status: LeadStatus) => {
    await supabase.from("leads").update({ status }).eq("id", leadId);
    await supabase.from("activity_log").insert({
      entity_type: "lead", entity_id: leadId, action: "status_changed",
      description: `Status endret til ${LEAD_STATUS_CONFIG[status].label}`, performed_by: user?.id,
    });
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, status } : l));
    toast.success(`Status endret til ${LEAD_STATUS_CONFIG[status].label}`);
  };

  const filtered = leads.filter((l) => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return l.company_name.toLowerCase().includes(s) ||
        (l.contact_name || "").toLowerCase().includes(s) ||
        (l.email || "").toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} leads</p>
        </div>
        <Button onClick={openCreate} className="gap-1.5 self-start">
          <Plus className="h-4 w-4" /> Ny lead
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Søk firma, kontakt, e-post..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statuser</SelectItem>
            {ALL_LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{LEAD_STATUS_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firma</TableHead>
                <TableHead>Kontakt</TableHead>
                <TableHead className="hidden md:table-cell">Kilde</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Est. verdi</TableHead>
                <TableHead className="hidden md:table-cell">Opprettet</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    Ingen leads funnet
                  </TableCell>
                </TableRow>
              ) : filtered.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(lead)}>
                  <TableCell>
                    <p className="text-sm font-medium">{lead.company_name}</p>
                    {lead.email && <p className="text-xs text-muted-foreground">{lead.email}</p>}
                  </TableCell>
                  <TableCell className="text-sm">{lead.contact_name || "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{lead.source || "—"}</TableCell>
                  <TableCell>
                    <Select value={lead.status} onValueChange={(v) => { handleStatusChange(lead.id, v as LeadStatus); }}>
                      <SelectTrigger className="h-7 w-[120px] text-xs" onClick={(e) => e.stopPropagation()}>
                        <Badge className={LEAD_STATUS_CONFIG[lead.status]?.className + " text-[10px]"}>
                          {LEAD_STATUS_CONFIG[lead.status]?.label}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_LEAD_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{LEAD_STATUS_CONFIG[s].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {lead.estimated_value > 0 ? `kr ${Number(lead.estimated_value).toLocaleString("nb-NO")}` : "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {format(new Date(lead.created_at), "d. MMM yyyy", { locale: nb })}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={(e) => { e.stopPropagation(); handleConvertToCalculation(lead); }}>
                      <ArrowRightLeft className="h-3 w-3" /> Kalkyle
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editLead ? "Rediger lead" : "Ny lead"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Firmanavn *</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Firma AS" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kontaktperson</Label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Ola Nordmann" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+47 999 99 999" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>E-post</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="epost@firma.no" type="email" />
              </div>
              <div className="space-y-1.5">
                <Label>Kilde</Label>
                <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Nettside, anbud, etc." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Estimert verdi (kr)</Label>
              <Input value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} placeholder="0" type="number" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sannsynlighet (%)</Label>
                <Input value={probability} onChange={(e) => setProbability(e.target.value)} placeholder="50" type="number" min="0" max="100" />
              </div>
              <div className="space-y-1.5">
                <Label>Forventet lukkedato</Label>
                <Input value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} type="date" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notater</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Evt. notater..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editLead ? "Lagre" : "Opprett"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
