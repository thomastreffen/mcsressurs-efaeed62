import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface EffectivePermission {
  key: string;
  allowed: boolean;
  source: "role" | "override";
  roleName?: string;
  mode?: "allow" | "deny";
}

export interface RbacState {
  userAccountId: string | null;
  permissions: Record<string, EffectivePermission>;
  scope: "own" | "company" | "all";
  loading: boolean;
  hasPermission: (key: string) => boolean;
  getPermissionSource: (key: string) => EffectivePermission | null;
  refetch: () => void;
}

/**
 * RBAC v2 hook – reads from the new people/user_accounts/user_roles_v2 model.
 * Falls back gracefully when user_account does not exist yet.
 */
export function useRbac(): RbacState {
  const { user } = useAuth();
  const [userAccountId, setUserAccountId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Record<string, EffectivePermission>>({});
  const [scope, setScope] = useState<"own" | "company" | "all">("own");
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!user) {
      setPermissions({});
      setScope("own");
      setUserAccountId(null);
      setLoading(false);
      return;
    }

    try {
      // Find user_account
      const { data: ua } = await supabase
        .from("user_accounts")
        .select("id")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (!ua) {
        setUserAccountId(null);
        setPermissions({});
        setScope("own");
        setLoading(false);
        return;
      }

      setUserAccountId(ua.id);

      // Get roles + their permissions
      const { data: userRoles } = await supabase
        .from("user_roles_v2")
        .select("role_id")
        .eq("user_account_id", ua.id);

      const roleIds = (userRoles as any[] || []).map((r: any) => r.role_id);

      // Get role names for source display
      let roleNameMap = new Map<string, string>();
      if (roleIds.length > 0) {
        const { data: roles } = await supabase
          .from("roles")
          .select("id, name")
          .in("id", roleIds);
        for (const r of (roles as any[] || [])) {
          roleNameMap.set(r.id, r.name);
        }
      }

      // Get role permissions
      let rolePerms: Record<string, { allowed: boolean; roleName: string }> = {};
      if (roleIds.length > 0) {
        const { data: rp } = await supabase
          .from("role_permissions")
          .select("role_id, permission_key, allowed")
          .in("role_id", roleIds);

        for (const p of (rp as any[] || [])) {
          if (p.allowed) {
            rolePerms[p.permission_key] = {
              allowed: true,
              roleName: roleNameMap.get(p.role_id) || "Rolle",
            };
          } else if (!rolePerms[p.permission_key]) {
            rolePerms[p.permission_key] = {
              allowed: false,
              roleName: roleNameMap.get(p.role_id) || "Rolle",
            };
          }
        }
      }

      // Get overrides
      const { data: overrides } = await supabase
        .from("user_permission_overrides_v2")
        .select("permission_key, mode")
        .eq("user_account_id", ua.id);

      // Merge
      const merged: Record<string, EffectivePermission> = {};

      // First apply role permissions
      for (const [key, val] of Object.entries(rolePerms)) {
        merged[key] = {
          key,
          allowed: val.allowed,
          source: "role",
          roleName: val.roleName,
        };
      }

      // Then apply overrides (wins)
      for (const o of (overrides as any[] || [])) {
        merged[o.permission_key] = {
          key: o.permission_key,
          allowed: o.mode === "allow",
          source: "override",
          mode: o.mode,
        };
      }

      setPermissions(merged);

      // Derive scope
      if (merged["scope.view.all"]?.allowed) setScope("all");
      else if (merged["scope.view.company"]?.allowed) setScope("company");
      else setScope("own");
    } catch (err) {
      console.warn("[useRbac] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const hasPermission = useCallback(
    (key: string) => permissions[key]?.allowed === true,
    [permissions]
  );

  const getPermissionSource = useCallback(
    (key: string) => permissions[key] || null,
    [permissions]
  );

  return {
    userAccountId,
    permissions,
    scope,
    loading,
    hasPermission,
    getPermissionSource,
    refetch: fetchPermissions,
  };
}
