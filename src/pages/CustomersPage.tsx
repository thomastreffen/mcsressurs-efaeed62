import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  ArrowUpDown,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Users2,
  Building2,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface CustomerRow {
  id: string;
  name: string;
  org_number: string | null;
  billing_city: string | null;
  main_email: string | null;
  projectCount: number;
  created_at: string;
}

const PAGE_SIZE = 20;

export default function CustomersPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"name" | "city" | "projects">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, org_number, billing_city, main_email, created_at")
      .order("name", { ascending: true });

    if (data) {
      // Get project counts per customer
      const { data: projectCounts } = await supabase
        .from("events")
        .select("customer_id")
        .not("customer_id", "is", null)
        .is("deleted_at", null);

      const countMap = new Map<string, number>();
      if (projectCounts) {
        for (const p of projectCounts) {
          const cid = (p as any).customer_id;
          if (cid) countMap.set(cid, (countMap.get(cid) || 0) + 1);
        }
      }

      setCustomers(
        data.map((c: any) => ({
          id: c.id,
          name: c.name,
          org_number: c.org_number,
          billing_city: c.billing_city,
          main_email: c.main_email,
          projectCount: countMap.get(c.id) || 0,
          created_at: c.created_at,
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => { fetchCustomers(); }, []);

  const filtered = useMemo(() => {
    let result = [...customers];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.org_number || "").toLowerCase().includes(q) ||
          (c.billing_city || "").toLowerCase().includes(q) ||
          (c.main_email || "").toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortField === "name") return dir * a.name.localeCompare(b.name);
      if (sortField === "city") return dir * (a.billing_city || "").localeCompare(b.billing_city || "");
      return dir * (a.projectCount - b.projectCount);
    });
    return result;
  }, [customers, search, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users2 className="h-6 w-6 text-primary" />
            Kunder
          </h1>
          <p className="text-sm text-muted-foreground/70">{filtered.length} kunder totalt</p>
        </div>
        <Button onClick={() => navigate("/customers/new")} className="gap-1.5 self-start rounded-xl">
          <Plus className="h-4 w-4" />
          Ny kunde
        </Button>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk kunder..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 rounded-xl"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : paged.length === 0 && !search ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="rounded-2xl bg-primary/5 p-6">
            <Users2 className="h-12 w-12 text-primary/40" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Ingen kunder ennå</h2>
            <p className="text-sm text-muted-foreground mt-1">Opprett din første kunde for å komme i gang.</p>
          </div>
          <Button onClick={() => navigate("/customers/new")} className="gap-1.5 rounded-xl">
            <Plus className="h-4 w-4" />
            Opprett kunde
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border/40 bg-card shadow-sm overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/30">
                  <TableHead>
                    <button onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-foreground text-xs font-semibold uppercase tracking-wider">
                      Kundenavn <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Org.nr</TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("city")} className="flex items-center gap-1 hover:text-foreground text-xs font-semibold uppercase tracking-wider">
                      By <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">E-post</TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("projects")} className="flex items-center gap-1 hover:text-foreground text-xs font-semibold uppercase tracking-wider">
                      Prosjekter <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                      Ingen kunder funnet.
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-secondary/40 transition-colors"
                      onClick={() => navigate(`/customers/${c.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold shrink-0">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium">{c.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">{c.org_number || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.billing_city || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">{c.main_email || "—"}</TableCell>
                      <TableCell>
                        {c.projectCount > 0 ? (
                          <Badge variant="secondary" className="text-xs rounded-lg">{c.projectCount}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
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
