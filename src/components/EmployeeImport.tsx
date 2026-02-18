import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, UserPlus, Check, RefreshCw } from "lucide-react";

interface MsEmployee {
  microsoftId: string;
  name: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  alreadyAdded: boolean;
}

export function EmployeeImport() {
  const [employees, setEmployees] = useState<MsEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [fetched, setFetched] = useState(false);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session?.provider_token) {
        toast.error("Ingen Microsoft-token funnet", {
          description: "Prøv å logge ut og inn igjen.",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke("fetch-employees", {
        body: { provider_token: session.provider_token },
      });

      if (error || !data?.employees) {
        toast.error("Kunne ikke hente ansatte", {
          description: data?.error || error?.message,
        });
        return;
      }
      setEmployees(data.employees);
      setFetched(true);
      setSelected(new Set());
    } catch (err) {
      toast.error("Feil ved henting av ansatte");
    } finally {
      setLoading(false);
    }
  };

  const addSelected = async () => {
    const toAdd = employees.filter(
      (e) => selected.has(e.microsoftId) && !e.alreadyAdded
    );
    if (toAdd.length === 0) return;

    setAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke("add-technicians", {
        body: { employees: toAdd },
      });

      if (error) {
        toast.error("Kunne ikke legge til montører", { description: error.message });
        return;
      }

      const successCount = data.results.filter((r: any) => r.success).length;
      toast.success(`${successCount} montør(er) lagt til`);

      // Mark as added
      setEmployees((prev) =>
        prev.map((e) =>
          selected.has(e.microsoftId) ? { ...e, alreadyAdded: true } : e
        )
      );
      setSelected(new Set());
    } catch (err) {
      toast.error("Feil ved import");
    } finally {
      setAdding(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllAvailable = () => {
    const available = filtered.filter((e) => !e.alreadyAdded).map((e) => e.microsoftId);
    setSelected(new Set(available));
  };

  const filtered = employees.filter(
    (e) =>
      e.name?.toLowerCase().includes(search.toLowerCase()) ||
      e.email?.toLowerCase().includes(search.toLowerCase()) ||
      e.department?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedCount = [...selected].filter(
    (id) => !employees.find((e) => e.microsoftId === id)?.alreadyAdded
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Importer ansatte fra Microsoft 365</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={fetchEmployees}
          disabled={loading}
          className="gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {fetched ? "Oppdater" : "Hent ansatte"}
        </Button>
      </div>

      {fetched && (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Søk etter navn, e-post eller avdeling..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {selectedCount > 0 && (
              <Button size="sm" onClick={addSelected} disabled={adding} className="gap-1.5">
                {adding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" />
                )}
                Legg til {selectedCount} montør{selectedCount > 1 ? "er" : ""}
              </Button>
            )}
          </div>

          <div className="rounded-lg border bg-card max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        filtered.filter((e) => !e.alreadyAdded).length > 0 &&
                        filtered
                          .filter((e) => !e.alreadyAdded)
                          .every((e) => selected.has(e.microsoftId))
                      }
                      onCheckedChange={selectAllAvailable}
                    />
                  </TableHead>
                  <TableHead>Navn</TableHead>
                  <TableHead>E-post</TableHead>
                  <TableHead>Stilling</TableHead>
                  <TableHead>Avdeling</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((emp) => (
                  <TableRow
                    key={emp.microsoftId}
                    className={emp.alreadyAdded ? "opacity-50" : "cursor-pointer"}
                    onClick={() => !emp.alreadyAdded && toggleSelect(emp.microsoftId)}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected.has(emp.microsoftId)}
                        disabled={emp.alreadyAdded}
                        onCheckedChange={() => toggleSelect(emp.microsoftId)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell className="text-muted-foreground">{emp.email}</TableCell>
                    <TableCell className="text-muted-foreground">{emp.jobTitle || "–"}</TableCell>
                    <TableCell className="text-muted-foreground">{emp.department || "–"}</TableCell>
                    <TableCell>
                      {emp.alreadyAdded ? (
                        <Badge variant="secondary" className="gap-1">
                          <Check className="h-3 w-3" />
                          Lagt til
                        </Badge>
                      ) : (
                        <Badge variant="outline">Ny</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {search ? "Ingen treff" : "Ingen ansatte funnet"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            {employees.length} ansatte totalt · {employees.filter((e) => e.alreadyAdded).length} allerede lagt til
          </p>
        </>
      )}
    </div>
  );
}
