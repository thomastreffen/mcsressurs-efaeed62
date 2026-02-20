import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PermissionState {
  permissions: Record<string, boolean>;
  scope: "own" | "company" | "all";
  loading: boolean;
  hasPermission: (key: string) => boolean;
  refetch: () => void;
}

export function usePermissions(): PermissionState {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [scope, setScope] = useState<"own" | "company" | "all">("own");
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!user) {
      setPermissions({});
      setScope("own");
      setLoading(false);
      return;
    }

    try {
      // Fetch role permissions via user_role_assignments
      const { data: assignments } = await supabase
        .from("user_role_assignments")
        .select("role_id")
        .eq("user_id", user.id);

      const roleIds = assignments?.map((a: any) => a.role_id) || [];

      let rolePerms: Record<string, boolean> = {};
      if (roleIds.length > 0) {
        const { data: rp } = await supabase
          .from("role_permissions")
          .select("permission_key, allowed")
          .in("role_id", roleIds);

        for (const p of rp || []) {
          // bool_or: if any role allows it, it's allowed
          if ((p as any).allowed) {
            rolePerms[(p as any).permission_key] = true;
          } else if (!(rolePerms[(p as any).permission_key])) {
            rolePerms[(p as any).permission_key] = false;
          }
        }
      }

      // Fetch user overrides
      const { data: overrides } = await supabase
        .from("user_permission_overrides")
        .select("permission_key, allowed")
        .eq("user_id", user.id);

      // Merge: override wins
      const merged = { ...rolePerms };
      for (const o of overrides || []) {
        merged[(o as any).permission_key] = (o as any).allowed;
      }

      // Also check legacy role for backward compat
      if (user.role === "super_admin") {
        merged["scope.view.all"] = true;
        merged["admin.manage_companies"] = true;
        merged["admin.manage_departments"] = true;
        merged["admin.manage_users"] = true;
        merged["admin.manage_roles"] = true;
        merged["admin.manage_settings"] = true;
      } else if (user.role === "admin") {
        merged["scope.view.company"] = true;
      }

      setPermissions(merged);

      // Derive scope
      if (merged["scope.view.all"]) setScope("all");
      else if (merged["scope.view.company"]) setScope("company");
      else setScope("own");
    } catch (err) {
      console.warn("[Permissions] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const hasPermission = useCallback(
    (key: string) => permissions[key] === true,
    [permissions]
  );

  return { permissions, scope, loading, hasPermission, refetch: fetchPermissions };
}
