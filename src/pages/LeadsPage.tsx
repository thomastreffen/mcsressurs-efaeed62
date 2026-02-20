import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format, isPast, isToday } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { LEAD_STATUS_CONFIG, ALL_LEAD_STATUSES, NEXT_ACTION_TYPES, type LeadStatus } from "@/lib/lead-status";
import { Search, Plus, Loader2, Building2, AlertTriangle, Clock, User } from "lucide-react";
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
  assigned_owner_user_id: string | null;
  next_action_type: string | null;
  next_action_date: string | null;
  next_action_note: string | null;
}

export default function LeadsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});

  // Create form state
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");

  const fetchLeads = async () => {
    setLoading(true);
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    const leadData = (data || []) as any as Lead[];
    setLeads(leadData);

    // Fetch owner names
    const ownerIds = [...new Set(leadData.map(l => l.assigned_owner_user_id).filter(Boolean))];
    if (ownerIds.length > 0) {
      const { data: techs } = await supabase.from("technicians").select("user_id, name").in("user_id", ownerIds as string[]);
      const map: Record<string, string> = {};
      (techs || []).forEach((t: any) => { map[t.user_id] = t.name; });
      setOwnerNames(map);
    }
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
      // Add creator as owner participant
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
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-1.5 self-start">
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
                <TableHead className="hidden md:table-cell">Eier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Neste aksjon</TableHead>
                <TableHead className="text-right">Est. verdi</TableHead>
                <TableHead className="hidden md:table-cell">Opprettet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    Ingen leads funnet
                  </TableCell>
                </TableRow>
              ) : filtered.map((lead) => {
                const isOverdue = lead.next_action_date && isPast(new Date(lead.next_action_date)) && !isToday(new Date(lead.next_action_date));
                return (
                  <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/sales/leads/${lead.id}`)}>
                    <TableCell>
                      <p className="text-sm font-medium">{lead.company_name}</p>
                      {lead.contact_name && <p className="text-xs text-muted-foreground">{lead.contact_name}</p>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {lead.assigned_owner_user_id ? ownerNames[lead.assigned_owner_user_id] || "—" : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={LEAD_STATUS_CONFIG[lead.status]?.className + " text-[10px]"}>
                        {LEAD_STATUS_CONFIG[lead.status]?.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {lead.next_action_date ? (
                        <div className="flex items-center gap-1.5">
                          {isOverdue ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                          ) : (
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <span className={`text-xs ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                            {NEXT_ACTION_TYPES.find(t => t.key === lead.next_action_type)?.label || ""}
                            {" "}
                            {format(new Date(lead.next_action_date), "d. MMM", { locale: nb })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {lead.estimated_value > 0 ? `kr ${Number(lead.estimated_value).toLocaleString("nb-NO")}` : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {format(new Date(lead.created_at), "d. MMM yyyy", { locale: nb })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
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
