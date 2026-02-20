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

interface Company {
  id: string;
  name: string;
  org_number: string | null;
  is_active: boolean;
  created_at: string;
}

export function CompaniesTab() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState({ name: "", org_number: "", is_active: true });
  const [saving, setSaving] = useState(false);

  const fetchCompanies = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("internal_companies")
      .select("*")
      .order("name");
    setCompanies((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", org_number: "", is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (c: Company) => {
    setEditing(c);
    setForm({ name: c.name, org_number: c.org_number || "", is_active: c.is_active });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Navn er påkrevd");
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from("internal_companies")
        .update({ name: form.name, org_number: form.org_number || null, is_active: form.is_active })
        .eq("id", editing.id);
      if (error) toast.error("Feil ved oppdatering", { description: error.message });
      else toast.success("Selskap oppdatert");
    } else {
      const { error } = await supabase
        .from("internal_companies")
        .insert({ name: form.name, org_number: form.org_number || null, is_active: form.is_active });
      if (error) toast.error("Feil ved opprettelse", { description: error.message });
      else toast.success("Selskap opprettet");
    }
    setSaving(false);
    setDialogOpen(false);
    fetchCompanies();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Internselskaper</CardTitle>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nytt selskap
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Navn</TableHead>
              <TableHead>Org.nr</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">{c.org_number || "—"}</TableCell>
                <TableCell>
                  <Badge variant={c.is_active ? "default" : "secondary"}>
                    {c.is_active ? "Aktiv" : "Inaktiv"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                    Rediger
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Rediger selskap" : "Nytt selskap"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Selskapsnavn</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Organisasjonsnummer</Label>
              <Input value={form.org_number} onChange={(e) => setForm({ ...form, org_number: e.target.value })} />
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
