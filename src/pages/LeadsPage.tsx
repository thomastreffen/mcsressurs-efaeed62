import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatDistanceToNow, isPast, isToday } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BulkDeleteBar } from "@/components/BulkDeleteBar";
import { LEAD_STATUS_CONFIG, ALL_LEAD_STATUSES, PIPELINE_STAGES, NEXT_ACTION_TYPES, type LeadStatus } from "@/lib/lead-status";
import { Search, Plus, Loader2, ArrowRight, Lightbulb } from "lucide-react";
import { toast } from "sonner";

// Next step label based on status
function getNextStepLabel(status: LeadStatus): string {
  switch (status) {
    case "new": return "Kontakt";
    case "contacted": return "Avtal befaring";
    case "befaring": return "Kvalifiser";
    case "qualified": return "Lag kalkyle";
    case "tilbud_sendt": return "Følg opp";
    case "forhandling": return "Lukk";
    case "won": return "Start prosjekt";
    case "lost": return "—";
    default: return "—";
  }
}

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
  updated_at: string;
  assigned_owner_user_id: string | null;
  next_action_type: string | null;
  next_action_date: string | null;
  next_action_note: string | null;
  lead_ref_code: string | null;
}

export default function LeadsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAdmin } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Create form state
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");

  const fetchLeads = async () => {
    setLoading(true);
    const { data } = await supabase.from("leads").select("*").is("deleted_at", null).order("updated_at", { ascending: false });
    setLeads((data || []) as any as Lead[]);
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, []);

  const resetForm = () => {
    setCompanyName(""); setContactName(""); setEmail(""); setPhone("");
    setSource(""); setEstimatedValue("");
  };

  const handleCreate = async () => {
    if (!companyName.trim()) { toast.error("Firmanavn er påkrevd"); return; }
    setSaving(true);
    const { data, error } = await supabase.from("leads").insert({
      company_name: companyName.trim(),
      contact_name: contactName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      source: source.trim() || null,
      estimated_value: Number(estimatedValue) || 0,
      owner_id: user?.id,
      assigned_owner_user_id: user?.id,
    } as any).select("id").single();

    if (data) {
      await supabase.from("lead_participants").insert({ lead_id: data.id, user_id: user!.id, role: "owner" });
      await supabase.from("lead_history").insert({
        lead_id: data.id, action: "created", description: `Lead opprettet: ${companyName.trim()}`, performed_by: user?.id,
      });
      toast.success("Lead opprettet");
      setDialogOpen(false);
      resetForm();
      navigate(`/sales/leads/${data.id}`);
    } else {
      toast.error("Kunne ikke opprette lead");
    }
    setSaving(false);
  };

  const filtered = leads.filter((l) => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return l.company_name.toLowerCase().includes(s) ||
        (l.contact_name || "").toLowerCase().includes(s) ||
        (l.email || "").toLowerCase().includes(s) ||
        (l.lead_ref_code || "").toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-4">
      {/* ── Compact header ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Søk firma, kontakt, referanse..." className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statuser</SelectItem>
            {ALL_LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{LEAD_STATUS_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">{filtered.length} leads</span>
          <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-1.5 h-9">
            <Plus className="h-3.5 w-3.5" /> Ny lead
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {selectedIds.length > 0 && (
            <BulkDeleteBar
              selectedIds={selectedIds}
              entityType="leads"
              entityLabel="leads"
              onComplete={() => { setSelectedIds([]); fetchLeads(); }}
              onCancel={() => setSelectedIds([])}
            />
          )}

          {filtered.length === 0 ? (
            /* ── Helpful empty state ── */
            <div className="rounded-xl border border-dashed bg-card/50 py-12 px-6 text-center space-y-4">
              <Lightbulb className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-foreground">Ingen leads funnet</p>
                <p className="text-xs text-muted-foreground mt-1">Opprett din første lead for å starte salgspipeline</p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Opprett lead
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/sales/pipeline")} className="gap-1.5">
                  Slik fungerer pipeline <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={filtered.length > 0 && selectedIds.length === filtered.length}
                          onCheckedChange={() => selectedIds.length === filtered.length ? setSelectedIds([]) : setSelectedIds(filtered.map(l => l.id))}
                        />
                      </TableHead>
                    )}
                    <TableHead>Lead</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Sist aktivitet</TableHead>
                    <TableHead className="hidden md:table-cell">Neste steg</TableHead>
                    <TableHead className="text-right">Est. verdi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((lead) => {
                    const stageColor = PIPELINE_STAGES.find(s => s.key === lead.status)?.color || "hsl(210, 10%, 60%)";
                    return (
                      <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/sales/leads/${lead.id}`)}>
                        {isAdmin && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.includes(lead.id)}
                              onCheckedChange={() => setSelectedIds(prev => prev.includes(lead.id) ? prev.filter(x => x !== lead.id) : [...prev, lead.id])}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stageColor }} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{lead.company_name}</p>
                              <p className="text-[10px] text-muted-foreground/60 font-mono">{lead.lead_ref_code || "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={LEAD_STATUS_CONFIG[lead.status]?.className + " text-[10px]"}>
                            {LEAD_STATUS_CONFIG[lead.status]?.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-xs text-muted-foreground/70">
                            {formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true, locale: nb })}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-xs text-muted-foreground">{getNextStepLabel(lead.status)}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {lead.estimated_value > 0 ? `kr ${Number(lead.estimated_value).toLocaleString("nb-NO")}` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ny lead</DialogTitle>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleCreate} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Opprett
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
