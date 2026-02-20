import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Department {
  id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  company_name?: string;
}

interface Company {
  id: string;
  name: string;
}

export function DepartmentsTab() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState({ name: "", company_id: "", is_active: true });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: depts }, { data: comps }] = await Promise.all([
      supabase.from("departments").select("*").order("name"),
      supabase.from("internal_companies").select("id, name").eq("is_active", true).order("name"),
    ]);

    const compMap = new Map((comps as any[] || []).map((c: any) => [c.id, c.name]));
    setDepartments(
      (depts as any[] || []).map((d: any) => ({ ...d, company_name: compMap.get(d.company_id) || "?" }))
    );
    setCompanies((comps as any[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", company_id: companies[0]?.id || "", is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (d: Department) => {
    setEditing(d);
    setForm({ name: d.name, company_id: d.company_id, is_active: d.is_active });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.company_id) {
      toast.error("Navn og selskap er påkrevd");
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from("departments")
        .update({ name: form.name, company_id: form.company_id, is_active: form.is_active })
        .eq("id", editing.id);
      if (error) toast.error("Feil", { description: error.message });
      else toast.success("Avdeling oppdatert");
    } else {
      const { error } = await supabase
        .from("departments")
        .insert({ name: form.name, company_id: form.company_id, is_active: form.is_active });
      if (error) toast.error("Feil", { description: error.message });
      else toast.success("Avdeling opprettet");
    }
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Avdelinger</CardTitle>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" /> Ny avdeling
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Navn</TableHead>
              <TableHead>Selskap</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="text-muted-foreground">{d.company_name}</TableCell>
                <TableCell>
                  <Badge variant={d.is_active ? "default" : "secondary"}>
                    {d.is_active ? "Aktiv" : "Inaktiv"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(d)}>Rediger</Button>
                </TableCell>
              </TableRow>
            ))}
            {departments.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Ingen avdelinger opprettet ennå
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Rediger avdeling" : "Ny avdeling"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Selskap</Label>
              <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
                <SelectTrigger><SelectValue placeholder="Velg selskap" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Avdelingsnavn</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Aktiv</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
