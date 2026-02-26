import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatDistanceToNow, isPast, isToday } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveLeads, fetchDeletedLeads, fetchArchivedLeads } from "@/lib/lead-queries";
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
import { LEAD_STATUS_CONFIG, ALL_LEAD_STATUSES, PIPELINE_STAGES, type LeadStatus } from "@/lib/lead-status";
import { Search, Plus, Loader2, ArrowRight, RotateCcw, Archive, Trash2, Users, Phone, CalendarDays, Mail, FileText, Clock, Send, MessageSquare } from "lucide-react";
import { toast } from "sonner";

type ViewMode = "active" | "archived" | "trash";

const NEXT_STEP_CONFIG: Record<string, { label: string; icon: typeof Phone }> = {
  new: { label: "Ring kunde", icon: Phone },
  contacted: { label: "Avtal befaring", icon: CalendarDays },
  befaring: { label: "Bekreft spesifikasjon", icon: FileText },
  qualified: { label: "Utarbeid tilbud", icon: FileText },
  tilbud_sendt: { label: "Purre tilbud", icon: Send },
  forhandling: { label: "Avklar detaljer", icon: MessageSquare },
  won: { label: "Opprett prosjekt", icon: ArrowRight },
  lost: { label: "—", icon: Clock },
};

function getNextStepLabel(status: string): string {
  return NEXT_STEP_CONFIG[status]?.label || "—";
}

function getNextStepIcon(status: string) {
  const Icon = NEXT_STEP_CONFIG[status]?.icon;
  return Icon ? <Icon className="h-3 w-3 text-muted-foreground/60 shrink-0" /> : null;
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
  deleted_at: string | null;
  archived_at: string | null;
}

export default function LeadsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAdmin } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [viewMode, setViewMode] = useState<ViewMode>("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");

  const fetchLeads = async () => {
    setLoading(true);
    let result;
    if (viewMode === "trash") {
      result = await fetchDeletedLeads();
    } else if (viewMode === "archived") {
      result = await fetchArchivedLeads();
    } else {
      result = await fetchActiveLeads();
    }
    const sorted = (result.data || []).sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    setLeads(sorted as any as Lead[]);
    setSelectedIds([]);
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, [viewMode]);

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

  const handleRestore = async (leadId: string) => {
    if (viewMode === "trash") {
      await supabase.from("leads").update({ deleted_at: null, deleted_by: null, delete_reason: null } as any).eq("id", leadId);
    } else if (viewMode === "archived") {
      await supabase.from("leads").update({ archived_at: null, archived_by: null } as any).eq("id", leadId);
    }
    toast.success("Lead gjenopprettet");
    fetchLeads();
  };

  const filtered = leads.filter((l) => {
    if (viewMode === "active" && statusFilter !== "all" && l.status !== statusFilter) return false;
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
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* View mode toggle */}
        <div className="flex items-center gap-1 rounded-xl border border-border/40 p-0.5 bg-secondary/20">
          {([
            { key: "active" as ViewMode, label: "Aktive", icon: null },
            { key: "archived" as ViewMode, label: "Arkiv", icon: Archive },
            { key: "trash" as ViewMode, label: "Papirkurv", icon: Trash2 },
          ]).map(v => (
            <button
              key={v.key}
              onClick={() => setViewMode(v.key)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                viewMode === v.key ? "bg-card text-foreground font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.icon && <v.icon className="h-3 w-3" />}
              {v.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Søk kunde, kontakt, referanse..." className="pl-9 h-9 rounded-xl" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {viewMode === "active" && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] h-9 rounded-xl"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statuser</SelectItem>
              {ALL_LEAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{LEAD_STATUS_CONFIG[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">{filtered.length} henvendelser</span>
          {viewMode === "active" && (
            <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-1.5 h-9 rounded-xl">
              <Plus className="h-3.5 w-3.5" /> Ny henvendelse
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {viewMode === "active" && selectedIds.length > 0 && (
            <BulkDeleteBar
              selectedIds={selectedIds}
              entityType="leads"
              entityLabel="leads"
              onComplete={() => { setSelectedIds([]); fetchLeads(); }}
              onCancel={() => setSelectedIds([])}
            />
          )}

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/40 bg-card/50 py-16 px-6 text-center space-y-4">
              <Users className="h-10 w-10 mx-auto text-muted-foreground/30" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {viewMode === "active" ? "Ingen henvendelser funnet" : viewMode === "archived" ? "Ingen arkiverte henvendelser" : "Papirkurven er tom"}
                </p>
                {viewMode === "active" && (
                  <p className="text-xs text-muted-foreground mt-1">Registrer din første kundehenvendelse for å starte ordrepipeline</p>
                )}
              </div>
              {viewMode === "active" && (
                <div className="flex items-center justify-center gap-3">
                  <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-1.5 rounded-xl">
                    <Plus className="h-3.5 w-3.5" /> Ny henvendelse
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate("/sales/pipeline")} className="gap-1.5 rounded-xl">
                    Se ordrepipeline <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-border/40 bg-card shadow-sm overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/30">
                    {isAdmin && viewMode === "active" && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={filtered.length > 0 && selectedIds.length === filtered.length}
                          onCheckedChange={() => selectedIds.length === filtered.length ? setSelectedIds([]) : setSelectedIds(filtered.map(l => l.id))}
                        />
                      </TableHead>
                    )}
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Kunde</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                    <TableHead className="hidden md:table-cell text-xs font-semibold uppercase tracking-wider">Sist aktivitet</TableHead>
                    {viewMode === "active" && <TableHead className="hidden md:table-cell text-xs font-semibold uppercase tracking-wider">Neste steg</TableHead>}
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Est. verdi</TableHead>
                    {viewMode !== "active" && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((lead) => {
                    const stageColor = PIPELINE_STAGES.find(s => s.key === lead.status)?.color || "hsl(210, 10%, 60%)";
                    return (
                      <TableRow
                        key={lead.id}
                        className="cursor-pointer hover:bg-secondary/40 transition-colors"
                        onClick={() => viewMode === "active" ? navigate(`/sales/leads/${lead.id}`) : undefined}
                      >
                        {isAdmin && viewMode === "active" && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.includes(lead.id)}
                              onCheckedChange={() => setSelectedIds(prev => prev.includes(lead.id) ? prev.filter(x => x !== lead.id) : [...prev, lead.id])}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stageColor }} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{lead.company_name}</p>
                              <p className="text-[10px] text-muted-foreground/50 font-mono">{lead.lead_ref_code || "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={LEAD_STATUS_CONFIG[lead.status]?.className + " text-[10px] rounded-lg"}>
                            {LEAD_STATUS_CONFIG[lead.status]?.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-xs text-muted-foreground/60">
                            {formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true, locale: nb })}
                          </span>
                        </TableCell>
                        {viewMode === "active" && (
                          <TableCell className="hidden md:table-cell">
                            <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                              {getNextStepIcon(lead.status)}
                              {getNextStepLabel(lead.status)}
                            </span>
                          </TableCell>
                        )}
                        <TableCell className="text-right font-mono text-sm">
                          {lead.estimated_value > 0 ? `kr ${Number(lead.estimated_value).toLocaleString("nb-NO")}` : "—"}
                        </TableCell>
                        {viewMode !== "active" && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" onClick={() => handleRestore(lead.id)} className="gap-1 text-xs h-7">
                              <RotateCcw className="h-3 w-3" /> Gjenopprett
                            </Button>
                          </TableCell>
                        )}
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
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Ny kundehenvendelse</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Installatør / kunde *</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Elektro AS" className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kontaktperson</Label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Ola Nordmann" className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+47 999 99 999" className="rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>E-post</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="epost@firma.no" type="email" className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
              <Label>Kilde</Label>
                <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Messe, anbud, eksisterende kunde..." className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Estimert ordreverdi (kr)</Label>
              <Input value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} placeholder="0" type="number" className="rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Avbryt</Button>
            <Button onClick={handleCreate} disabled={saving} className="gap-1.5 rounded-xl">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Opprett
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
