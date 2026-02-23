import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useContracts } from "@/hooks/useContracts";
import { ContractRiskBadge } from "@/components/contracts/ContractRiskBadge";
import { CreateContractDialog } from "@/components/contracts/CreateContractDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, FileText, AlertTriangle, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

const STATUS_LABELS: Record<string, string> = {
  draft: "Utkast",
  signed: "Signert",
  archived: "Arkivert",
};

export default function ContractsPage() {
  const { data: contracts, isLoading } = useContracts();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");

  const filtered = (contracts || []).filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (riskFilter !== "all" && c.risk_level !== riskFilter) return false;
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

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk tittel, motpart..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statuser</SelectItem>
            <SelectItem value="draft">Utkast</SelectItem>
            <SelectItem value="signed">Signert</SelectItem>
            <SelectItem value="archived">Arkivert</SelectItem>
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Risiko" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle risikonivåer</SelectItem>
            <SelectItem value="green">Lav</SelectItem>
            <SelectItem value="yellow">Middels</SelectItem>
            <SelectItem value="red">Høy</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
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
                <TableHead>Status</TableHead>
                <TableHead>Risiko</TableHead>
                <TableHead className="hidden lg:table-cell">Sluttdato</TableHead>
                <TableHead className="hidden lg:table-cell">Dagbot</TableHead>
                <TableHead className="hidden xl:table-cell">Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => navigate(`/contracts/${c.id}`)}
                >
                  <TableCell className="font-medium">{c.title}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {c.counterparty_name || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {STATUS_LABELS[c.status] || c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ContractRiskBadge riskLevel={c.risk_level} riskScore={c.risk_score || undefined} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {c.end_date ? format(new Date(c.end_date), "d. MMM yyyy", { locale: nb }) : "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {c.penalty_type && c.penalty_type !== "ingen" ? (
                      <span className="flex items-center gap-1 text-orange-600 text-xs">
                        <AlertTriangle className="h-3 w-3" />
                        Ja
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Nei</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                    {c.contract_type || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateContractDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
