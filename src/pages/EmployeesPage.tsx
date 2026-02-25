import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PersonnelDialog } from "@/components/access-control/PersonnelDialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, FolderOpen, Users, Archive } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface TechRow {
  id: string;
  name: string;
  email: string;
  trade_certificate_type: string | null;
  is_plannable_resource: boolean;
  archived_at: string | null;
}

export default function EmployeesPage() {
  const [technicians, setTechnicians] = useState<TechRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchTechnicians = async () => {
    setLoading(true);
    let query = supabase
      .from("technicians")
      .select("id, name, email, trade_certificate_type, is_plannable_resource, archived_at")
      .not("user_id", "is", null)
      .order("name");

    if (!showArchived) {
      query = query.is("archived_at", null);
    }

    const { data } = await query;
    setTechnicians(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchTechnicians();
  }, [showArchived]);

  const openDialog = (id: string) => {
    setSelectedId(id);
    setDialogOpen(true);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Ansatte</h1>
          <p className="text-sm text-muted-foreground">
            Operativ oversikt over montører og ressurser
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Vis arkiverte</span>
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : technicians.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Users className="h-10 w-10" />
          <p className="text-sm">Ingen ansatte funnet.</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Navn</TableHead>
                <TableHead className="hidden sm:table-cell">Rolle / Fagbrev</TableHead>
                <TableHead className="text-center">Planleggbar</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center w-[60px]">Mappe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {technicians.map((tech) => (
                <TableRow
                  key={tech.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openDialog(tech.id)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{tech.name}</p>
                      <p className="text-xs text-muted-foreground">{tech.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {tech.trade_certificate_type || "–"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {tech.is_plannable_resource ? (
                      <Badge variant="success" className="text-[10px]">Ja</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Nei</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {tech.archived_at ? (
                      <Badge variant="destructive" className="text-[10px]">Arkivert</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Aktiv</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDialog(tech.id);
                      }}
                    >
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PersonnelDialog
        technicianId={selectedId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={fetchTechnicians}
      />
    </div>
  );
}
