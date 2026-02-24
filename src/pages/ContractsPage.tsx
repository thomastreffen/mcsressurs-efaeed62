import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ContractRiskBadge } from "@/components/contracts/ContractRiskBadge";
import { CreateContractDialog } from "@/components/contracts/CreateContractDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, FileText, AlertTriangle, FolderKanban, UserPlus, Globe } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import type { Contract } from "@/hooks/useContracts";

const STATUS_LABELS: Record<string, string> = {
  draft: "Utkast",
  signed: "Signert",
  archived: "Arkivert",
};

interface ContractWithLinks extends Contract {
  job_title?: string;
  lead_company?: string;
}

export default function ContractsPage() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [linkFilter, setLinkFilter] = useState("all");

  const { data: contracts, isLoading } = useQuery({
    queryKey: ["contracts-with-links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const items = data as unknown as ContractWithLinks[];

      // Fetch linked job/lead names
      const jobIds = items.filter(c => c.job_id).map(c => c.job_id!);
      const leadIds = items.filter(c => c.lead_id).map(c => c.lead_id!);

      const [jobsRes, leadsRes] = await Promise.all([
        jobIds.length > 0 ? supabase.from("events").select("id, title").in("id", jobIds) : { data: [] },
        leadIds.length > 0 ? supabase.from("leads").select("id, company_name").in("id", leadIds) : { data: [] },
      ]);

      const jobMap = new Map((jobsRes.data || []).map((j: any) => [j.id, j.title]));
      const leadMap = new Map((leadsRes.data || []).map((l: any) => [l.id, l.company_name]));

      for (const c of items) {
        if (c.job_id) c.job_title = jobMap.get(c.job_id) || undefined;
        if (c.lead_id) c.lead_company = leadMap.get(c.lead_id) || undefined;
      }
      return items;
    },
  });

  const filtered = (contracts || []).filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (riskFilter !== "all" && c.risk_level !== riskFilter) return false;
    if (linkFilter === "job" && !c.job_id) return false;
    if (linkFilter === "lead" && !c.lead_id) return false;
    if (linkFilter === "global" && (c.job_id || c.lead_id)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.title.toLowerCase().includes(q) ||
        c.counterparty_name?.toLowerCase().includes(q) ||
        c.contract_type?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getLinkInfo = (c: ContractWithLinks) => {
    if (c.job_id) return { label: c.job_title || "Prosjekt", path: `/projects/${c.job_id}`, icon: <FolderKanban className="h-3 w-3" />, type: "Prosjekt" };
    if (c.lead_id) return { label: c.lead_company || "Lead", path: `/sales/leads/${c.lead_id}`, icon: <UserPlus className="h-3 w-3" />, type: "Lead" };
    return { label: "Global", path: null, icon: <Globe className="h-3 w-3" />, type: "Global" };
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Kontrakter</h1>
          <p className="text-sm text-muted-foreground">
            Oversikt over alle kontrakter med risikostatus og frister.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Ny kontrakt
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Søk tittel, motpart..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statuser</SelectItem>
            <SelectItem value="draft">Utkast</SelectItem>
            <SelectItem value="signed">Signert</SelectItem>
            <SelectItem value="archived">Arkivert</SelectItem>
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Risiko" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle risikonivåer</SelectItem>
            <SelectItem value="green">Lav</SelectItem>
            <SelectItem value="yellow">Middels</SelectItem>
            <SelectItem value="red">Høy</SelectItem>
          </SelectContent>
        </Select>
        <Select value={linkFilter} onValueChange={setLinkFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Tilknytning" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle tilknytninger</SelectItem>
            <SelectItem value="job">Jobb</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="global">Global</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-14 w-full" />))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Ingen kontrakter funnet.</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tittel</TableHead>
                <TableHead className="hidden md:table-cell">Motpart</TableHead>
                <TableHead>Knyttet til</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risiko</TableHead>
                <TableHead className="hidden lg:table-cell">Sluttdato</TableHead>
                <TableHead className="hidden lg:table-cell">Dagbot</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const link = getLinkInfo(c);
                return (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-accent/50" onClick={() => navigate(`/contracts/${c.id}`)}>
                    <TableCell className="font-medium">{c.title}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{c.counterparty_name || "—"}</TableCell>
                    <TableCell>
                      {link.path ? (
                        <Link
                          to={link.path}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {link.icon} {link.label}
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">{link.icon} {link.label}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[c.status] || c.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <ContractRiskBadge riskLevel={c.risk_level} riskScore={c.risk_score || undefined} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {c.end_date ? format(new Date(c.end_date), "d. MMM yyyy", { locale: nb }) : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {c.penalty_type && c.penalty_type !== "ingen" ? (
                        <span className="flex items-center gap-1 text-orange-600 text-xs"><AlertTriangle className="h-3 w-3" />Ja</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Nei</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateContractDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
