import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Plus, Search, Loader2, ChevronLeft, ChevronRight, Calculator } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  CALCULATION_STATUS_CONFIG,
  ALL_CALCULATION_STATUSES,
  type CalculationStatus,
} from "@/lib/calculation-status";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface CalcRow {
  id: string;
  customer_name: string;
  customer_email: string | null;
  project_title: string;
  status: CalculationStatus;
  total_price: number;
  created_at: string;
}

const PAGE_SIZE = 20;

export default function CalculationsPage() {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const [calcs, setCalcs] = useState<CalcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form state
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchCalcs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("calculations")
      .select("id, customer_name, customer_email, project_title, status, total_price, created_at")
      .order("created_at", { ascending: false });
    if (data) setCalcs(data as CalcRow[]);
    setLoading(false);
  };

  useEffect(() => { fetchCalcs(); }, []);

  const filtered = useMemo(() => {
    let result = [...calcs];
    if (statusFilter !== "all") result = result.filter((c) => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.project_title.toLowerCase().includes(q) ||
          c.customer_name.toLowerCase().includes(q) ||
          (c.customer_email || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [calcs, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleCreate = async () => {
    if (!customerName.trim() || !projectTitle.trim()) {
      toast.error("Kundenavn og prosjekttittel er påkrevd");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.from("calculations").insert({
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim() || null,
      project_title: projectTitle.trim(),
      description: description.trim() || null,
      created_by: user!.id,
    }).select("id").single();

    if (error) {
      toast.error("Kunne ikke opprette kalkulasjon", { description: error.message });
      setCreating(false);
      return;
    }

    setCreateOpen(false);
    setCustomerName("");
    setCustomerEmail("");
    setProjectTitle("");
    setDescription("");
    setCreating(false);
    navigate(`/calculations/${data.id}`);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Kalkulasjoner
          </h1>
          <p className="text-sm text-muted-foreground">{filtered.length} kalkulasjoner totalt</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5 self-start">
            <Plus className="h-4 w-4" />
            Ny kalkulasjon
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk kalkulasjoner..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Alle statuser" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statuser</SelectItem>
            {ALL_CALCULATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{CALCULATION_STATUS_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prosjekt</TableHead>
                  <TableHead>Kunde</TableHead>
                  <TableHead className="hidden md:table-cell">Dato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Totalpris</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Ingen kalkulasjoner funnet.
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((calc) => (
                    <TableRow
                      key={calc.id}
                      className="cursor-pointer hover:bg-secondary/50"
                      onClick={() => navigate(`/calculations/${calc.id}`)}
                    >
                      <TableCell>
                        <p className="text-sm font-medium truncate max-w-[250px]">{calc.project_title}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm truncate max-w-[200px]">{calc.customer_name}</p>
                        {calc.customer_email && (
                          <p className="text-xs text-muted-foreground truncate">{calc.customer_email}</p>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(calc.created_at), "d. MMM yyyy", { locale: nb })}
                      </TableCell>
                      <TableCell>
                        <Badge className={CALCULATION_STATUS_CONFIG[calc.status]?.className}>
                          {CALCULATION_STATUS_CONFIG[calc.status]?.label || calc.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {Number(calc.total_price) > 0
                          ? `kr ${Number(calc.total_price).toLocaleString("nb-NO", { minimumFractionDigits: 0 })}`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Side {page + 1} av {totalPages}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ny kalkulasjon</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Kundenavn *</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Firma eller person" />
            </div>
            <div className="space-y-1.5">
              <Label>Kunde e-post</Label>
              <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="epost@eksempel.no" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label>Prosjekttittel *</Label>
              <Input value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder="Beskrivende tittel" />
            </div>
            <div className="space-y-1.5">
              <Label>Beskrivelse</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Beskriv arbeidet som skal utføres..." rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Avbryt</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Opprett
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
