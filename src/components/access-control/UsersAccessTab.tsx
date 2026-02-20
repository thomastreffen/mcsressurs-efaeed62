import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronRight, Shield, Building, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role_assignments: { role_id: string; role_name: string }[];
  memberships: { company_id: string; department_id: string | null; company_name: string; department_name: string | null }[];
  overrides: { permission_key: string; allowed: boolean }[];
}

interface RoleOption {
  id: string;
  name: string;
}

interface CompanyOption {
  id: string;
  name: string;
  departments: { id: string; name: string }[];
}

const PERMISSION_KEYS = [
  "scope.view.own", "scope.view.company", "scope.view.all",
  "jobs.view", "jobs.create", "jobs.edit", "jobs.delete", "jobs.archive", "jobs.assign_users", "jobs.view_pricing",
  "offers.view", "offers.create", "offers.edit", "offers.delete", "offers.archive",
  "calc.view", "calc.edit",
  "docs.view", "docs.upload", "docs.delete", "docs.restrict_to_participants",
  "comm.view", "comm.create_note", "comm.delete_note", "comm.restrict_to_participants",
  "calendar.read_busy", "calendar.write_events", "calendar.delete_events",
  "admin.manage_companies", "admin.manage_departments", "admin.manage_users", "admin.manage_roles", "admin.manage_settings",
];

export function UsersAccessTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedMemberships, setSelectedMemberships] = useState<{ company_id: string; department_id: string | null }[]>([]);
  const [overrides, setOverrides] = useState<Record<string, "allow" | "deny" | "inherit">>({});
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);

    // Fetch users from list-users edge function
    const { data: usersData } = await supabase.functions.invoke("list-users");
    const userList: { id: string; email: string; name: string }[] = usersData?.users || [];

    // Fetch role assignments
    const { data: assignments } = await supabase.from("user_role_assignments").select("user_id, role_id");
    // Fetch roles
    const { data: rolesData } = await supabase.from("roles").select("id, name").order("name");
    // Fetch memberships
    const { data: memberships } = await supabase.from("user_memberships").select("user_id, company_id, department_id");
    // Fetch companies + departments
    const { data: comps } = await supabase.from("internal_companies").select("id, name").eq("is_active", true);
    const { data: depts } = await supabase.from("departments").select("id, name, company_id").eq("is_active", true);
    // Fetch overrides
    const { data: overridesData } = await supabase.from("user_permission_overrides").select("user_id, permission_key, allowed");

    const roleMap = new Map((rolesData as any[] || []).map((r: any) => [r.id, r.name]));
    const compMap = new Map((comps as any[] || []).map((c: any) => [c.id, c.name]));
    const deptMap = new Map((depts as any[] || []).map((d: any) => [d.id, d.name]));

    const companyOptions: CompanyOption[] = (comps as any[] || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      departments: (depts as any[] || []).filter((d: any) => d.company_id === c.id).map((d: any) => ({ id: d.id, name: d.name })),
    }));

    const enriched: UserRow[] = userList.map((u) => ({
      ...u,
      role_assignments: (assignments as any[] || [])
        .filter((a: any) => a.user_id === u.id)
        .map((a: any) => ({ role_id: a.role_id, role_name: roleMap.get(a.role_id) || "?" })),
      memberships: (memberships as any[] || [])
        .filter((m: any) => m.user_id === u.id)
        .map((m: any) => ({
          company_id: m.company_id,
          department_id: m.department_id,
          company_name: compMap.get(m.company_id) || "?",
          department_name: m.department_id ? deptMap.get(m.department_id) || "?" : null,
        })),
      overrides: (overridesData as any[] || [])
        .filter((o: any) => o.user_id === u.id)
        .map((o: any) => ({ permission_key: o.permission_key, allowed: o.allowed })),
    }));

    setUsers(enriched);
    setRoles((rolesData as any[]) || []);
    setCompanies(companyOptions);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openEdit = (u: UserRow) => {
    setSelectedUser(u);
    setSelectedRoles(u.role_assignments.map((r) => r.role_id));
    setSelectedMemberships(u.memberships.map((m) => ({ company_id: m.company_id, department_id: m.department_id })));

    const ov: Record<string, "allow" | "deny" | "inherit"> = {};
    for (const o of u.overrides) {
      ov[o.permission_key] = o.allowed ? "allow" : "deny";
    }
    setOverrides(ov);
    setDialogOpen(true);
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]
    );
  };

  const toggleMembership = (companyId: string, deptId: string | null) => {
    setSelectedMemberships((prev) => {
      const exists = prev.some((m) => m.company_id === companyId && m.department_id === deptId);
      if (exists) return prev.filter((m) => !(m.company_id === companyId && m.department_id === deptId));
      return [...prev, { company_id: companyId, department_id: deptId }];
    });
  };

  const cycleOverride = (key: string) => {
    setOverrides((prev) => {
      const current = prev[key] || "inherit";
      const next = current === "inherit" ? "allow" : current === "allow" ? "deny" : "inherit";
      const copy = { ...prev };
      if (next === "inherit") delete copy[key];
      else copy[key] = next;
      return copy;
    });
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);

    try {
      const uid = selectedUser.id;

      // 1. Sync role assignments
      await supabase.from("user_role_assignments").delete().eq("user_id", uid);
      if (selectedRoles.length > 0) {
        await supabase.from("user_role_assignments").insert(
          selectedRoles.map((rid) => ({ user_id: uid, role_id: rid }))
        );
      }

      // 2. Sync memberships
      await supabase.from("user_memberships").delete().eq("user_id", uid);
      if (selectedMemberships.length > 0) {
        await supabase.from("user_memberships").insert(
          selectedMemberships.map((m) => ({ user_id: uid, company_id: m.company_id, department_id: m.department_id }))
        );
      }

      // 3. Sync overrides
      await supabase.from("user_permission_overrides").delete().eq("user_id", uid);
      const ovRows = Object.entries(overrides).map(([key, val]) => ({
        user_id: uid,
        permission_key: key,
        allowed: val === "allow",
      }));
      if (ovRows.length > 0) {
        await supabase.from("user_permission_overrides").insert(ovRows);
      }

      toast.success("Bruker oppdatert");
      setDialogOpen(false);
      fetchAll();
    } catch (err: any) {
      toast.error("Feil", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="mt-4 space-y-3">
      <h3 className="text-sm font-semibold">Brukere ({users.length})</h3>

      {users.map((u) => (
        <Card key={u.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => openEdit(u)}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{u.name}</p>
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {u.role_assignments.map((r) => (
                  <Badge key={r.role_id} variant="secondary" className="text-[10px] gap-1">
                    <Shield className="h-3 w-3" />
                    {r.role_name}
                  </Badge>
                ))}
                {u.memberships.map((m, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] gap-1">
                    <Building className="h-3 w-3" />
                    {m.company_name}{m.department_name ? ` / ${m.department_name}` : ""}
                  </Badge>
                ))}
                {u.overrides.length > 0 && (
                  <Badge variant="destructive" className="text-[10px] gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    {u.overrides.length} overstyringer
                  </Badge>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Rediger tilgang: {selectedUser?.name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-6">
              {/* Roles */}
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Roller</Label>
                <div className="space-y-1.5 mt-2">
                  {roles.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox checked={selectedRoles.includes(r.id)} onCheckedChange={() => toggleRole(r.id)} />
                      {r.name}
                    </label>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Memberships */}
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selskap & Avdelinger</Label>
                <div className="space-y-3 mt-2">
                  {companies.map((c) => (
                    <div key={c.id}>
                      <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                        <Checkbox
                          checked={selectedMemberships.some((m) => m.company_id === c.id && m.department_id === null)}
                          onCheckedChange={() => toggleMembership(c.id, null)}
                        />
                        {c.name} <span className="text-xs text-muted-foreground">(hele selskapet)</span>
                      </label>
                      {c.departments.map((d) => (
                        <label key={d.id} className="flex items-center gap-2 cursor-pointer text-sm ml-6 mt-1">
                          <Checkbox
                            checked={selectedMemberships.some((m) => m.company_id === c.id && m.department_id === d.id)}
                            onCheckedChange={() => toggleMembership(c.id, d.id)}
                          />
                          {d.name}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Permission Overrides */}
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Overstyringer <span className="normal-case font-normal">(klikk for å veksle)</span>
                </Label>
                <div className="space-y-1 mt-2">
                  {PERMISSION_KEYS.map((key) => {
                    const state = overrides[key] || "inherit";
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => cycleOverride(key)}
                        className="w-full flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-accent/50 transition-colors"
                      >
                        <span className="font-mono">{key}</span>
                        <Badge
                          variant={state === "allow" ? "default" : state === "deny" ? "destructive" : "outline"}
                          className="text-[10px]"
                        >
                          {state === "allow" ? "Tillat" : state === "deny" ? "Nekt" : "Arv"}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
