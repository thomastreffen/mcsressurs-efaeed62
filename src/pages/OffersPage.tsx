import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CALCULATION_STATUS_CONFIG,
  ALL_CALCULATION_STATUSES,
  type CalculationStatus,
} from "@/lib/calculation-status";
import { Search, ReceiptText, Loader2, Plus, ChevronLeft, ChevronRight } from "lucide-react";

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

export default function OffersPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [calcs, setCalcs] = useState<CalcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);

  const fetchCalcs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("calculations")
      .select("id, customer_name, customer_email, project_title, status, total_price, created_at")
      .is("deleted_at", null)
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ReceiptText className="h-6 w-6 text-primary" />
            Tilbud
          </h1>
          <p className="text-sm text-muted-foreground/70">{filtered.length} tilbud totalt</p>
        </div>
        {isAdmin && (
          <Button onClick={() => navigate("/sales/offers/new")} className="gap-1.5 self-start rounded-xl">
            <Plus className="h-4 w-4" />
            Nytt tilbud
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk tilbud..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 rounded-xl"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px] rounded-xl">
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
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border/40 bg-card shadow-sm overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/30">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Prosjekt</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Kunde</TableHead>
                  <TableHead className="hidden md:table-cell text-xs font-semibold uppercase tracking-wider">Dato</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Totalpris</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                      <ReceiptText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      Ingen tilbud funnet.
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((calc) => (
                    <TableRow
                      key={calc.id}
                      className="cursor-pointer hover:bg-secondary/40 transition-colors"
                      onClick={() => navigate(`/sales/offers/${calc.id}`)}
                    >
                      <TableCell>
                        <p className="text-sm font-medium truncate max-w-[250px]">{calc.project_title}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm truncate max-w-[200px]">{calc.customer_name}</p>
                        {calc.customer_email && (
                          <p className="text-xs text-muted-foreground/60 truncate">{calc.customer_email}</p>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground/70 whitespace-nowrap">
                        {format(new Date(calc.created_at), "d. MMM yyyy", { locale: nb })}
                      </TableCell>
                      <TableCell>
                        <Badge className={CALCULATION_STATUS_CONFIG[calc.status]?.className + " rounded-lg"}>
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
                <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-xl">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="rounded-xl">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
