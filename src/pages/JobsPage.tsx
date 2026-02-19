import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateJobDialog } from "@/components/CreateJobDialog";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Plus,
  Search,
  ArrowUpDown,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { JOB_STATUS_CONFIG, ALL_STATUSES, getDisplayNumber, type JobStatus } from "@/lib/job-status";
import { useAuth } from "@/hooks/useAuth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface JobRow {
  id: string;
  title: string;
  customer: string;
  address: string;
  startTime: Date;
  status: JobStatus;
  jobNumber: string | null;
  internalNumber: string | null;
  outlookSyncStatus: string;
  techNames: string[];
  techColors: string[];
}

const PAGE_SIZE = 20;

export default function JobsPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<"start" | "status" | "customer">("start");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    async function fetchJobs() {
      setLoading(true);
      const { data, error } = await supabase
        .from("events")
        .select(`
          id, title, customer, address, start_time, status, job_number, internal_number, outlook_sync_status,
          event_technicians(technician_id, technicians(name, color))
        `)
        .order("start_time", { ascending: false });

      if (data) {
        setJobs(
          data.map((e: any) => {
            const techs = (e.event_technicians || [])
              .filter((et: any) => et.technicians)
              .map((et: any) => et.technicians);
            return {
              id: e.id,
              title: e.title,
              customer: e.customer || "",
              address: e.address || "",
              startTime: new Date(e.start_time),
              status: e.status as JobStatus,
              jobNumber: e.job_number,
              internalNumber: e.internal_number,
              outlookSyncStatus: e.outlook_sync_status || "not_synced",
              techNames: techs.map((t: any) => t.name),
              techColors: techs.map((t: any) => t.color || "#6366f1"),
            };
          })
        );
      }
      setLoading(false);
    }
    fetchJobs();
  }, []);

  const filtered = useMemo(() => {
    let result = [...jobs];

    if (statusFilter !== "all") {
      result = result.filter((j) => j.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.customer.toLowerCase().includes(q) ||
          j.address.toLowerCase().includes(q) ||
          (j.internalNumber || "").toLowerCase().includes(q) ||
          (j.jobNumber || "").toLowerCase().includes(q) ||
          j.techNames.some((n) => n.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortField === "start") return dir * (a.startTime.getTime() - b.startTime.getTime());
      if (sortField === "customer") return dir * a.customer.localeCompare(b.customer);
      return dir * a.status.localeCompare(b.status);
    });

    return result;
  }, [jobs, statusFilter, search, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Jobber</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} jobber totalt</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5 self-start">
            <Plus className="h-4 w-4" />
            Ny jobb
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk jobber..."
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
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{JOB_STATUS_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
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
                  <TableHead className="w-[120px]">Jobbnr</TableHead>
                  <TableHead>Kunde</TableHead>
                  <TableHead className="hidden md:table-cell">Adresse</TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("start")} className="flex items-center gap-1 hover:text-foreground">
                      Dato
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("status")} className="flex items-center gap-1 hover:text-foreground">
                      Status
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">Montører</TableHead>
                  <TableHead className="hidden lg:table-cell w-[100px]">Sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Ingen jobber funnet.
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((job) => (
                    <TableRow
                      key={job.id}
                      className="cursor-pointer hover:bg-secondary/50"
                      onClick={() => navigate(`/jobs/${job.id}`)}
                    >
                      <TableCell className="font-mono text-xs">
                        {getDisplayNumber(job.jobNumber, job.internalNumber)}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium truncate max-w-[200px]">{job.title}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{job.customer}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground truncate max-w-[200px]">
                        {job.address}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(job.startTime, "d. MMM", { locale: nb })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className="text-[10px] whitespace-nowrap"
                          style={{
                            backgroundColor: `hsl(var(--status-${job.status.replace(/_/g, "-")}))`,
                            color: `hsl(var(--status-${job.status.replace(/_/g, "-")}-foreground))`,
                          }}
                        >
                          {JOB_STATUS_CONFIG[job.status]?.label || job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-1">
                          {job.techColors.slice(0, 3).map((color, i) => (
                            <div
                              key={i}
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: color }}
                              title={job.techNames[i]}
                            />
                          ))}
                          {job.techNames.length > 3 && (
                            <span className="text-xs text-muted-foreground">+{job.techNames.length - 3}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <SyncDot status={job.outlookSyncStatus} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Side {page + 1} av {totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <CreateJobDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        preselectedTechId={null}
      />
    </div>
  );
}

function SyncDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    synced: "bg-green-500",
    restored: "bg-blue-500",
    failed: "bg-destructive",
    not_synced: "bg-muted-foreground/30",
    cancelled: "bg-muted-foreground/30",
    missing_in_outlook: "bg-orange-500",
  };

  const labels: Record<string, string> = {
    synced: "Synced",
    restored: "Restored",
    failed: "Feilet",
    not_synced: "Ikke synced",
    cancelled: "Kansellert",
    missing_in_outlook: "Mangler",
  };

  return (
    <div className="flex items-center gap-1.5" title={labels[status] || status}>
      <div className={`h-2 w-2 rounded-full ${colors[status] || colors.not_synced}`} />
      <span className="text-[10px] text-muted-foreground">{labels[status] || status}</span>
    </div>
  );
}
