import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PERMISSION_CATEGORIES, SCOPE_OPTIONS, getPermLabel, getPermDescription } from "@/lib/permission-labels";
import { Info } from "lucide-react";

interface Role {
  id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  permissions: Record<string, boolean>;
}

export function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState({ name: "", description: "", permissions: {} as Record<string, boolean> });
  const [saving, setSaving] = useState(false);

  const fetchRoles = async () => {
    setLoading(true);
    const { data: rolesData } = await supabase.from("roles").select("*").order("name");
    const { data: permsData } = await supabase.from("role_permissions").select("*");

    const permsByRole: Record<string, Record<string, boolean>> = {};
    for (const p of (permsData as any[]) || []) {
      if (!permsByRole[p.role_id]) permsByRole[p.role_id] = {};
      permsByRole[p.role_id][p.permission_key] = p.allowed;
    }

    setRoles(
      (rolesData as any[] || []).map((r: any) => ({
        ...r,
        permissions: permsByRole[r.id] || {},
      }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchRoles(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", permissions: {} });
    setDialogOpen(true);
  };

  const openEdit = (r: Role) => {
    setEditing(r);
    setForm({ name: r.name, description: r.description || "", permissions: { ...r.permissions } });
    setDialogOpen(true);
  };

  const togglePerm = (key: string) => {
    setForm((f) => ({
      ...f,
      permissions: { ...f.permissions, [key]: !f.permissions[key] },
    }));
  };

  const getActiveScope = (): string => {
    if (form.permissions["scope.view.all"]) return "scope.view.all";
    if (form.permissions["scope.view.company"]) return "scope.view.company";
    return "scope.view.own";
  };

  const setScope = (scopeKey: string) => {
    setForm((f) => ({
      ...f,
      permissions: {
        ...f.permissions,
        "scope.view.own": scopeKey === "scope.view.own",
        "scope.view.company": scopeKey === "scope.view.company",
        "scope.view.all": scopeKey === "scope.view.all",
      },
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Rollenavn er påkrevd");
      return;
    }
    setSaving(true);
    try {
      let roleId = editing?.id;
      if (editing) {
        await supabase.from("roles").update({ name: form.name, description: form.description || null }).eq("id", editing.id);
      } else {
        const { data, error } = await supabase.from("roles").insert({ name: form.name, description: form.description || null }).select("id").single();
        if (error) throw error;
        roleId = (data as any).id;
      }
      await supabase.from("role_permissions").delete().eq("role_id", roleId!);
      const permRows = Object.entries(form.permissions)
        .filter(([, v]) => v)
        .map(([key]) => ({ role_id: roleId!, permission_key: key, allowed: true }));
      if (permRows.length > 0) {
        await supabase.from("role_permissions").insert(permRows);
      }
      toast.success(editing ? "Rolle oppdatert" : "Rolle opprettet");
      setDialogOpen(false);
      fetchRoles();
    } catch (err: any) {
      toast.error("Feil", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const getRoleSummary = (r: Role) => {
    const permCount = Object.values(r.permissions).filter(Boolean).length;
    const scope = r.permissions["scope.view.all"]
      ? "Alle selskaper"
      : r.permissions["scope.view.company"]
        ? "Eget selskap"
        : "Egne prosjekter";
    return `${scope} · ${permCount} rettigheter`;
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <TooltipProvider>
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Roller ({roles.length})</h3>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" /> Ny rolle
          </Button>
        </div>

        {roles.map((r) => (
          <Card key={r.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => openEdit(r)}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{r.name}</span>
                  {r.is_system_role && <Badge variant="secondary" className="text-[10px]">System</Badge>}
                </div>
                {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>}
                <p className="text-xs text-muted-foreground mt-1">{getRoleSummary(r)}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>{editing ? `Rediger: ${editing.name}` : "Ny rolle"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Rollenavn</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Beskrivelse</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Kort beskrivelse av hva denne rollen innebærer…" />
              </div>

              {/* Scope dropdown */}
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Omfang – Hvem kan brukeren se?</Label>
                <Select value={getActiveScope()} onValueChange={setScope}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ScrollArea className="h-[320px] pr-4">
                <div className="space-y-5">
                  {PERMISSION_CATEGORIES.map((group) => (
                    <div key={group.category}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.category}</p>
                      <p className="text-[11px] text-muted-foreground mb-2">{group.description}</p>
                      <div className="space-y-1.5">
                        {group.keys.map((key) => {
                          const desc = getPermDescription(key);
                          return (
                            <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                              <Checkbox
                                checked={form.permissions[key] || false}
                                onCheckedChange={() => togglePerm(key)}
                              />
                              <span>{getPermLabel(key)}</span>
                              {desc && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-[250px] text-xs">{desc}</TooltipContent>
                                </Tooltip>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
