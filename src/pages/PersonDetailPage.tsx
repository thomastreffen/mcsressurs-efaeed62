import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2, ArrowLeft, User, Building, Shield, Activity,
  Archive, ArchiveRestore,
} from "lucide-react";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PermissionsPanel } from "@/components/permissions/PermissionsPanel";

interface PersonData {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
}

interface EmploymentData {
  id: string;
  company_id: string;
  department_id: string | null;
  is_plannable_resource: boolean;
  birth_date: string | null;
  hms_card_number: string | null;
  hms_card_expires_at: string | null;
  trade_certificate_type: string | null;
  driver_license_classes: string | null;
  notes: string | null;
  archived_at: string | null;
}

interface UserAccountData {
  id: string;
  auth_user_id: string;
  company_id: string;
  is_active: boolean;
}

interface RoleOption { id: string; name: string; description?: string | null; }
interface CompanyOption { id: string; name: string; departments: { id: string; name: string }[]; }

interface AuditEntry {
  id: string;
  action: string;
  target_type: string;
  metadata: any;
  created_at: string;
}

export default function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [person, setPerson] = useState<PersonData | null>(null);
  const [employment, setEmployment] = useState<EmploymentData | null>(null);
  const [account, setAccount] = useState<UserAccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Org tab
  const [companies, setCompanies] = useState<CompanyOption[]>([]);

  // Permissions (unified)
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [assignedRoles, setAssignedRoles] = useState<string[]>([]);
  const [scopes, setScopes] = useState<{ company_id: string; department_id: string | null }[]>([]);
  const [overrides, setOverrides] = useState<Record<string, "allow" | "deny">>({});
  const [scopeOverride, setScopeOverride] = useState("inherit");
  const [rolePermissions, setRolePermissions] = useState<Record<string, boolean>>({});
  const [rolePermSourceMap, setRolePermSourceMap] = useState<Record<string, string>>({});
  const [allRolePerms, setAllRolePerms] = useState<any[]>([]);

  // Audit tab
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const [
      { data: pData },
      { data: epData },
      { data: uaData },
      { data: rolesData },
      { data: compsData },
      { data: deptsData },
    ] = await Promise.all([
      supabase.from("people").select("*").eq("id", id).single(),
      supabase.from("employment_profiles").select("*").eq("person_id", id).maybeSingle(),
      supabase.from("user_accounts").select("*").eq("person_id", id).maybeSingle(),
      supabase.from("roles").select("id, name, description").order("name"),
      supabase.from("internal_companies").select("id, name").eq("is_active", true),
      supabase.from("departments").select("id, name, company_id").eq("is_active", true),
    ]);

    setPerson(pData as any);
    setEmployment(epData as any);
    setAccount(uaData as any);
    setRoles((rolesData as any[]) || []);
    setCompanies(
      (compsData as any[] || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        departments: (deptsData as any[] || []).filter((d: any) => d.company_id === c.id).map((d: any) => ({ id: d.id, name: d.name })),
      }))
    );

    if (uaData) {
      const ua = uaData as any;
      const [
        { data: urData },
        { data: usData },
        { data: uoData },
        { data: rpData },
        { data: auditData },
      ] = await Promise.all([
        supabase.from("user_roles_v2").select("role_id").eq("user_account_id", ua.id),
        supabase.from("user_scopes").select("company_id, department_id").eq("user_account_id", ua.id),
        supabase.from("user_permission_overrides_v2").select("permission_key, mode").eq("user_account_id", ua.id),
        supabase.from("role_permissions").select("role_id, permission_key, allowed"),
        supabase.from("audit_log").select("*").eq("target_id", id).order("created_at", { ascending: false }).limit(50),
      ]);

      const assignedRoleIds = (urData as any[] || []).map((r: any) => r.role_id);
      setAssignedRoles(assignedRoleIds);
      setAllRolePerms((rpData as any[]) || []);
      setScopes((usData as any[] || []).map((s: any) => ({ company_id: s.company_id, department_id: s.department_id })));

      // Build role permissions map + source map
      buildRolePermMaps(assignedRoleIds, rpData as any[], rolesData as any[]);

      // Build overrides
      const ov: Record<string, "allow" | "deny"> = {};
      let sc = "inherit";
      for (const o of (uoData as any[] || [])) {
        if (o.permission_key.startsWith("scope.view.")) {
          if (o.mode === "allow") sc = o.permission_key;
        } else {
          ov[o.permission_key] = o.mode;
        }
      }
      setOverrides(ov);
      setScopeOverride(sc);
      setAuditEntries((auditData as any[]) || []);
    }

    setLoading(false);
  }, [id]);

  const buildRolePermMaps = (assignedRoleIds: string[], rpData: any[], rolesData: any[]) => {
    const rp: Record<string, boolean> = {};
    const srcMap: Record<string, string> = {};
    const roleNameMap = new Map((rolesData || []).map((r: any) => [r.id, r.name]));
    for (const p of (rpData || [])) {
      if (assignedRoleIds.includes(p.role_id) && p.allowed) {
        rp[p.permission_key] = true;
        srcMap[p.permission_key] = roleNameMap.get(p.role_id) || "Rolle";
      }
    }
    setRolePermissions(rp);
    setRolePermSourceMap(srcMap);
  };

  // When assignedRoles change locally, rebuild perm maps
  const handleAssignedRolesChange = useCallback((newRoles: string[]) => {
    setAssignedRoles(newRoles);
    buildRolePermMaps(newRoles, allRolePerms, roles);
  }, [allRolePerms, roles]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveProfile = async () => {
    if (!person || !employment) return;
    setSaving(true);
    await Promise.all([
      supabase.from("people").update({
        full_name: person.full_name,
        phone: person.phone,
      }).eq("id", person.id),
      supabase.from("employment_profiles").update({
        is_plannable_resource: employment.is_plannable_resource,
        birth_date: employment.birth_date || null,
        hms_card_number: employment.hms_card_number || null,
        hms_card_expires_at: employment.hms_card_expires_at || null,
        trade_certificate_type: employment.trade_certificate_type || null,
        driver_license_classes: employment.driver_license_classes || null,
        notes: employment.notes || null,
        company_id: employment.company_id,
        department_id: employment.department_id,
      }).eq("id", employment.id),
    ]);
    setSaving(false);
    toast.success("Profil oppdatert");
  };

  const handleArchiveToggle = async () => {
    if (!employment) return;
    setSaving(true);
    const isArchived = !!employment.archived_at;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("employment_profiles").update({
      archived_at: isArchived ? null : new Date().toISOString(),
      archived_by: isArchived ? null : user?.id || null,
    }).eq("id", employment.id);
    setSaving(false);
    toast.success(isArchived ? "Person gjenopprettet" : "Person arkivert");
    fetchData();
  };

  const handleSaveAll = async () => {
    if (!account) return;
    setSaving(true);
    try {
      // Save roles (v2 + legacy sync)
      await supabase.from("user_roles_v2").delete().eq("user_account_id", account.id);
      if (assignedRoles.length > 0) {
        await supabase.from("user_roles_v2").insert(
          assignedRoles.map((rid) => ({ user_account_id: account.id, role_id: rid }))
        );
      }
      await supabase.from("user_role_assignments").delete().eq("user_id", account.auth_user_id);
      if (assignedRoles.length > 0) {
        await supabase.from("user_role_assignments").insert(
          assignedRoles.map((rid) => ({ user_id: account.auth_user_id, role_id: rid }))
        );
      }

      // Save scopes (v2 + legacy sync)
      await supabase.from("user_scopes").delete().eq("user_account_id", account.id);
      if (scopes.length > 0) {
        await supabase.from("user_scopes").insert(
          scopes.map((s) => ({ user_account_id: account.id, company_id: s.company_id, department_id: s.department_id }))
        );
      }
      await supabase.from("user_memberships").delete().eq("user_id", account.auth_user_id);
      if (scopes.length > 0) {
        await supabase.from("user_memberships").insert(
          scopes.map((s) => ({ user_id: account.auth_user_id, company_id: s.company_id, department_id: s.department_id }))
        );
      }

      // Save permission overrides (v2 + legacy sync)
      await supabase.from("user_permission_overrides_v2").delete().eq("user_account_id", account.id);
      const rows: any[] = Object.entries(overrides).map(([key, mode]) => ({
        user_account_id: account.id, permission_key: key, mode,
      }));
      if (scopeOverride !== "inherit") {
        rows.push({ user_account_id: account.id, permission_key: scopeOverride, mode: "allow" });
      }
      if (rows.length > 0) {
        await supabase.from("user_permission_overrides_v2").insert(rows);
      }

      await supabase.from("user_permission_overrides").delete().eq("user_id", account.auth_user_id);
      const legacyRows = rows.map((r) => ({
        user_id: account.auth_user_id,
        permission_key: r.permission_key,
        allowed: r.mode === "allow",
      }));
      if (legacyRows.length > 0) {
        await supabase.from("user_permission_overrides").insert(legacyRows);
      }

      toast.success("Roller, omfang og rettigheter lagret");
      fetchData();
    } catch (err: any) {
      toast.error("Feil", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/personer")}>
          <ArrowLeft className="h-4 w-4 mr-1" />Tilbake
        </Button>
        <p className="text-sm text-muted-foreground text-center py-12">Fant ikke persondata.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/personer")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold truncate">{person.full_name}</h1>
              {employment?.archived_at ? (
                <Badge variant="destructive" className="text-[10px]">Arkivert</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">Aktiv</Badge>
              )}
              {account && <Badge variant="secondary" className="text-[10px]">Brukerkonto</Badge>}
              {employment?.is_plannable_resource && <Badge variant="success" className="text-[10px]">Planleggbar</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{person.email}</p>
          </div>
          {employment && (
            <Button
              variant={employment.archived_at ? "outline" : "destructive"}
              size="sm"
              onClick={handleArchiveToggle}
              disabled={saving}
            >
              {employment.archived_at ? <><ArchiveRestore className="h-4 w-4 mr-1" />Gjenopprett</> : <><Archive className="h-4 w-4 mr-1" />Arkiver</>}
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile"><User className="h-4 w-4 mr-1.5" />Profil</TabsTrigger>
            <TabsTrigger value="org"><Building className="h-4 w-4 mr-1.5" />Organisasjon</TabsTrigger>
            {account && <TabsTrigger value="permissions"><Shield className="h-4 w-4 mr-1.5" />Rettigheter</TabsTrigger>}
            <TabsTrigger value="audit"><Activity className="h-4 w-4 mr-1.5" />Aktivitet</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <div className="rounded-lg border p-4 sm:p-6 space-y-5 max-w-2xl">
              {employment && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Planleggbar ressurs</Label>
                      <p className="text-[11px] text-muted-foreground">Vises i ressursplanen</p>
                    </div>
                    <Switch
                      checked={employment.is_plannable_resource}
                      onCheckedChange={(v) => setEmployment({ ...employment, is_plannable_resource: v })}
                    />
                  </div>
                  <Separator />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Fullt navn</Label>
                      <Input value={person.full_name} onChange={(e) => setPerson({ ...person, full_name: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Telefon</Label>
                      <Input value={person.phone || ""} onChange={(e) => setPerson({ ...person, phone: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Fødselsdato</Label>
                      <Input type="date" value={employment.birth_date || ""} onChange={(e) => setEmployment({ ...employment, birth_date: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">HMS-kortnummer</Label>
                      <Input value={employment.hms_card_number || ""} onChange={(e) => setEmployment({ ...employment, hms_card_number: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">HMS-kort utløper</Label>
                      <Input type="date" value={employment.hms_card_expires_at || ""} onChange={(e) => setEmployment({ ...employment, hms_card_expires_at: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Fagbrev-type</Label>
                      <Input value={employment.trade_certificate_type || ""} onChange={(e) => setEmployment({ ...employment, trade_certificate_type: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Førerkortklasser</Label>
                      <Input value={employment.driver_license_classes || ""} onChange={(e) => setEmployment({ ...employment, driver_license_classes: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Notater</Label>
                    <Textarea value={employment.notes || ""} onChange={(e) => setEmployment({ ...employment, notes: e.target.value })} rows={3} />
                  </div>
                </>
              )}
              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre profil"}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Organisation Tab */}
          <TabsContent value="org">
            <div className="rounded-lg border p-4 sm:p-6 space-y-5 max-w-2xl">
              {employment && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Selskap</Label>
                    <Select value={employment.company_id} onValueChange={(v) => setEmployment({ ...employment, company_id: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Avdeling</Label>
                    <Select value={employment.department_id || "none"} onValueChange={(v) => setEmployment({ ...employment, department_id: v === "none" ? null : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ingen avdeling</SelectItem>
                        {companies.find((c) => c.id === employment.company_id)?.departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre"}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Permissions Tab – flat Tripletex-style */}
          {account && (
            <TabsContent value="permissions">
              <PermissionsPanel
                userAccountId={account.id}
                roles={roles}
                assignedRoles={assignedRoles}
                onAssignedRolesChange={handleAssignedRolesChange}
                rolePermissions={rolePermissions}
                rolePermSourceMap={rolePermSourceMap}
                overrides={overrides}
                onOverridesChange={setOverrides}
                scopeOverride={scopeOverride}
                onScopeOverrideChange={setScopeOverride}
                scopes={scopes}
                onScopesChange={setScopes}
                companies={companies}
                saving={saving}
                onSave={handleSaveAll}
              />
            </TabsContent>
          )}

          {/* Audit Tab */}
          <TabsContent value="audit">
            <div className="rounded-lg border p-4 sm:p-6 max-w-2xl">
              {auditEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Ingen aktivitetslogg ennå.</p>
              ) : (
                <div className="space-y-3">
                  {auditEntries.map((e) => (
                    <Card key={e.id}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{e.action}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(e.created_at).toLocaleString("nb-NO")}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{e.target_type}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
