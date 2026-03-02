import { useState, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Search, Shield, RotateCcw, Copy, Info, Loader2, X,
} from "lucide-react";
import { PERMISSION_CATEGORIES, SCOPE_OPTIONS, getPermLabel, getPermDescription } from "@/lib/permission-labels";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EffectivePerm {
  key: string;
  allowed: boolean;
  source: "role" | "override" | "none";
  roleName?: string;
  overrideMode?: "allow" | "deny";
}

export interface RoleOption {
  id: string;
  name: string;
  description?: string | null;
}

export interface ScopeEntry {
  company_id: string;
  department_id: string | null;
}

export interface CompanyOption {
  id: string;
  name: string;
  departments: { id: string; name: string }[];
}

interface Props {
  /** The user_account_id we're editing */
  userAccountId: string;
  /** All available roles */
  roles: RoleOption[];
  /** Currently assigned role ids */
  assignedRoles: string[];
  onAssignedRolesChange: (roles: string[]) => void;
  /** Role permissions map: key -> boolean (aggregated from assigned roles) */
  rolePermissions: Record<string, boolean>;
  /** Role name map: permission_key -> role name that granted it */
  rolePermSourceMap: Record<string, string>;
  /** Current overrides */
  overrides: Record<string, "allow" | "deny">;
  onOverridesChange: (overrides: Record<string, "allow" | "deny">) => void;
  /** Scope */
  scopeOverride: string;
  onScopeOverrideChange: (v: string) => void;
  /** Organisational scopes */
  scopes: ScopeEntry[];
  onScopesChange: (s: ScopeEntry[]) => void;
  companies: CompanyOption[];
  /** All people for "copy from" */
  allPeople?: { id: string; name: string }[];
  onCopyFrom?: (personId: string) => void;
  /** Save + loading */
  saving: boolean;
  onSave: () => void;
  /** Show only overrides toggle */
  showOnlyOverrides?: boolean;
}

export function PermissionsPanel({
  roles,
  assignedRoles,
  onAssignedRolesChange,
  rolePermissions,
  rolePermSourceMap,
  overrides,
  onOverridesChange,
  scopeOverride,
  onScopeOverrideChange,
  scopes,
  onScopesChange,
  companies,
  allPeople,
  onCopyFrom,
  saving,
  onSave,
}: Props) {
  const [search, setSearch] = useState("");
  const [onlyOverrides, setOnlyOverrides] = useState(false);

  // Derive effective state per key
  const getEffective = useCallback(
    (key: string): EffectivePerm => {
      const ov = overrides[key];
      if (ov === "allow") return { key, allowed: true, source: "override", overrideMode: "allow" };
      if (ov === "deny") return { key, allowed: false, source: "override", overrideMode: "deny" };
      if (rolePermissions[key]) {
        return { key, allowed: true, source: "role", roleName: rolePermSourceMap[key] || "Rolle" };
      }
      return { key, allowed: false, source: "none" };
    },
    [overrides, rolePermissions, rolePermSourceMap]
  );

  const handleCheckboxClick = useCallback(
    (key: string) => {
      const eff = getEffective(key);
      const newOverrides = { ...overrides };

      if (eff.source === "override") {
        // Already overridden - toggle or remove
        if (eff.overrideMode === "allow") {
          // Was allow override -> if role gives it too, just remove override; else set deny
          if (rolePermissions[key]) {
            delete newOverrides[key]; // role gives it, remove override
          } else {
            delete newOverrides[key]; // unchecking an allow override = remove
          }
        } else {
          // Was deny override -> remove it (revert to role)
          delete newOverrides[key];
        }
      } else if (eff.source === "role") {
        // Role gives it, user wants to remove -> create deny override
        newOverrides[key] = "deny";
      } else {
        // No access, user wants to add -> create allow override
        newOverrides[key] = "allow";
      }

      onOverridesChange(newOverrides);
    },
    [getEffective, overrides, rolePermissions, onOverridesChange]
  );

  const handleResetOverride = useCallback(
    (key: string) => {
      const newOverrides = { ...overrides };
      delete newOverrides[key];
      onOverridesChange(newOverrides);
    },
    [overrides, onOverridesChange]
  );

  const handleResetAll = useCallback(() => {
    onOverridesChange({});
    onScopeOverrideChange("inherit");
  }, [onOverridesChange, onScopeOverrideChange]);

  const toggleRole = useCallback(
    (roleId: string) => {
      onAssignedRolesChange(
        assignedRoles.includes(roleId)
          ? assignedRoles.filter((r) => r !== roleId)
          : [...assignedRoles, roleId]
      );
    },
    [assignedRoles, onAssignedRolesChange]
  );

  const toggleScope = useCallback(
    (companyId: string, deptId: string | null) => {
      const exists = scopes.some(
        (s) => s.company_id === companyId && s.department_id === deptId
      );
      onScopesChange(
        exists
          ? scopes.filter(
              (s) => !(s.company_id === companyId && s.department_id === deptId)
            )
          : [...scopes, { company_id: companyId, department_id: deptId }]
      );
    },
    [scopes, onScopesChange]
  );

  // Filter categories by search
  const filteredCategories = useMemo(() => {
    const q = search.toLowerCase();
    return PERMISSION_CATEGORIES.map((cat) => ({
      ...cat,
      keys: cat.keys.filter((key) => {
        if (onlyOverrides && !overrides[key]) return false;
        if (!q) return true;
        return (
          getPermLabel(key).toLowerCase().includes(q) ||
          key.toLowerCase().includes(q) ||
          cat.category.toLowerCase().includes(q)
        );
      }),
    })).filter((cat) => cat.keys.length > 0);
  }, [search, onlyOverrides, overrides]);

  const overrideCount = Object.keys(overrides).length + (scopeOverride !== "inherit" ? 1 : 0);

  // Scope display
  const scopeDisplay = useMemo(() => {
    if (scopes.length === 0) return "Ingen tilgang konfigurert";
    return scopes
      .map((s) => {
        const comp = companies.find((c) => c.id === s.company_id);
        if (!comp) return "Ukjent";
        if (!s.department_id) return `${comp.name} (hele selskapet)`;
        const dept = comp.departments.find((d) => d.id === s.department_id);
        return `${comp.name} → ${dept?.name || "Ukjent avd."}`;
      })
      .join(", ");
  }, [scopes, companies]);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* ─── Section A: Roller ──────────────────────────────── */}
        <section className="rounded-lg border p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Roller</h3>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-2">
            Roller gir standardrettigheter. Velg én eller flere.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {roles.map((r) => (
              <label
                key={r.id}
                className="flex items-start gap-2.5 cursor-pointer rounded-md border p-3 hover:bg-accent/40 transition-colors"
              >
                <Checkbox
                  checked={assignedRoles.includes(r.id)}
                  onCheckedChange={() => toggleRole(r.id)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <span className="text-sm font-medium">{r.name}</span>
                  {r.description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      {r.description}
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* ─── Section: Omfang (Scopes) ───────────────────────── */}
        <section className="rounded-lg border p-4 sm:p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Omfang</h3>
            <p className="text-[11px] text-muted-foreground">
              Bestemmer hvilke selskaper og avdelinger brukeren kan se data i.
            </p>
            <p className="text-xs mt-1 text-muted-foreground">
              Gjelder: <span className="text-foreground font-medium">{scopeDisplay}</span>
            </p>
          </div>

          {/* Scope level override */}
          <div className="flex items-center gap-3 flex-wrap">
            <Label className="text-xs shrink-0">Synlighetsomfang:</Label>
            <Select value={scopeOverride} onValueChange={onScopeOverrideChange}>
              <SelectTrigger className="w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">Arv fra rolle</SelectItem>
                {SCOPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.key} value={opt.key}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Company/dept checkboxes */}
          <div className="space-y-3">
            {companies.map((c) => (
              <div key={c.id}>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                  <Checkbox
                    checked={scopes.some(
                      (s) => s.company_id === c.id && s.department_id === null
                    )}
                    onCheckedChange={() => toggleScope(c.id, null)}
                  />
                  {c.name}{" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    (hele selskapet)
                  </span>
                </label>
                {c.departments.map((d) => (
                  <label
                    key={d.id}
                    className="flex items-center gap-2 cursor-pointer text-sm ml-6 mt-1"
                  >
                    <Checkbox
                      checked={scopes.some(
                        (s) => s.company_id === c.id && s.department_id === d.id
                      )}
                      onCheckedChange={() => toggleScope(c.id, d.id)}
                    />
                    {d.name}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* ─── Section B: Rettigheter ─────────────────────────── */}
        <section className="rounded-lg border p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold">Rettigheter</h3>
            <div className="flex items-center gap-2 flex-wrap">
              {overrideCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1 text-destructive hover:text-destructive"
                  onClick={handleResetAll}
                >
                  <RotateCcw className="h-3 w-3" />
                  Tilbakestill alle ({overrideCount})
                </Button>
              )}
              {allPeople && onCopyFrom && (
                <CopyFromSelector people={allPeople} onSelect={onCopyFrom} />
              )}
            </div>
          </div>

          {/* Search + filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Søk i rettigheter…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="only-overrides"
                checked={onlyOverrides}
                onCheckedChange={setOnlyOverrides}
              />
              <Label htmlFor="only-overrides" className="text-xs cursor-pointer">
                Vis bare avvik fra rolle
              </Label>
            </div>
          </div>

          {/* Module accordions */}
          <Accordion type="multiple" defaultValue={PERMISSION_CATEGORIES.map((c) => c.category)}>
            {filteredCategories.map((cat) => (
              <AccordionItem key={cat.category} value={cat.category}>
                <AccordionTrigger className="py-2.5 text-sm hover:no-underline">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{cat.category}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      {cat.description}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-1">
                  <div className="space-y-0.5">
                    {cat.keys.map((key) => {
                      const eff = getEffective(key);
                      const desc = getPermDescription(key);
                      return (
                        <PermissionRow
                          key={key}
                          permKey={key}
                          effective={eff}
                          description={desc}
                          onToggle={() => handleCheckboxClick(key)}
                          onReset={
                            eff.source === "override"
                              ? () => handleResetOverride(key)
                              : undefined
                          }
                        />
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {filteredCategories.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Ingen rettigheter matcher søket.
            </p>
          )}
        </section>

        {/* ─── Sticky save bar ────────────────────────────────── */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t py-3 -mx-4 px-4 sm:-mx-5 sm:px-5 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {overrideCount > 0
              ? `${overrideCount} overstyring${overrideCount > 1 ? "er" : ""} aktiv`
              : "Ingen overstyringer"}
          </p>
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Lagre
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  PermissionRow                                                      */
/* ------------------------------------------------------------------ */

function PermissionRow({
  permKey,
  effective,
  description,
  onToggle,
  onReset,
}: {
  permKey: string;
  effective: EffectivePerm;
  description?: string;
  onToggle: () => void;
  onReset?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5 px-1 rounded hover:bg-accent/30 transition-colors group">
      {/* Checkbox */}
      <Checkbox
        checked={effective.allowed}
        onCheckedChange={onToggle}
        className="shrink-0"
      />

      {/* Label + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{getPermLabel(permKey)}</span>
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[260px] text-xs">
                {description}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Effective badge */}
      <div className="flex items-center gap-1.5 shrink-0">
        {effective.allowed ? (
          <Badge
            variant="outline"
            className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
          >
            Har tilgang
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-[10px] bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
          >
            Ingen tilgang
          </Badge>
        )}

        {/* Source indicator */}
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {effective.source === "role" && `Via rolle: ${effective.roleName}`}
          {effective.source === "override" &&
            (effective.overrideMode === "allow"
              ? "Overstyring: Tillatt"
              : "Overstyring: Nektet")}
          {effective.source === "none" && "Ingen"}
        </span>

        {/* Reset link */}
        {onReset && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            className="text-[10px] text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
          >
            Tilbakestill
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CopyFromSelector                                                   */
/* ------------------------------------------------------------------ */

function CopyFromSelector({
  people,
  onSelect,
}: {
  people: { id: string; name: string }[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setOpen(true)}>
        <Copy className="h-3 w-3" />
        Kopier fra…
      </Button>
    );
  }

  const filtered = people.filter((p) =>
    p.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="flex items-center gap-1.5">
      <Input
        placeholder="Søk person…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-8 w-[180px] text-xs"
        autoFocus
      />
      <div className="max-h-[200px] overflow-y-auto absolute top-full right-0 mt-1 bg-popover border rounded-md shadow-md z-50 w-[220px]">
        {filtered.slice(0, 10).map((p) => (
          <button
            key={p.id}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            onClick={() => {
              onSelect(p.id);
              setOpen(false);
              setQ("");
            }}
          >
            {p.name}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">Ingen treff</p>
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
