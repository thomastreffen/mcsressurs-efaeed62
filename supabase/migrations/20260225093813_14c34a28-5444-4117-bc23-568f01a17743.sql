-- Fix RLS for user access tables so super_admin/admin can always read/write
-- even if granular permissions are missing temporarily.

-- user_role_assignments
DROP POLICY IF EXISTS "Admins can manage role assignments" ON public.user_role_assignments;
CREATE POLICY "Admins can manage role assignments"
ON public.user_role_assignments
FOR ALL
USING (
  is_admin() OR check_permission(auth.uid(), 'admin.manage_users')
)
WITH CHECK (
  is_admin() OR check_permission(auth.uid(), 'admin.manage_users')
);

DROP POLICY IF EXISTS "Users can view own assignments" ON public.user_role_assignments;
CREATE POLICY "Users can view own assignments"
ON public.user_role_assignments
FOR SELECT
USING (
  user_id = auth.uid()
  OR is_admin()
  OR check_permission(auth.uid(), 'admin.manage_users')
);

-- user_memberships
DROP POLICY IF EXISTS "Admins can manage memberships" ON public.user_memberships;
CREATE POLICY "Admins can manage memberships"
ON public.user_memberships
FOR ALL
USING (
  is_admin() OR check_permission(auth.uid(), 'admin.manage_users')
)
WITH CHECK (
  is_admin() OR check_permission(auth.uid(), 'admin.manage_users')
);

DROP POLICY IF EXISTS "Users can view own memberships" ON public.user_memberships;
CREATE POLICY "Users can view own memberships"
ON public.user_memberships
FOR SELECT
USING (
  user_id = auth.uid()
  OR is_admin()
  OR check_permission(auth.uid(), 'admin.manage_users')
);

-- user_permission_overrides
DROP POLICY IF EXISTS "Admins can manage overrides" ON public.user_permission_overrides;
CREATE POLICY "Admins can manage overrides"
ON public.user_permission_overrides
FOR ALL
USING (
  is_admin() OR check_permission(auth.uid(), 'admin.manage_users')
)
WITH CHECK (
  is_admin() OR check_permission(auth.uid(), 'admin.manage_users')
);

DROP POLICY IF EXISTS "Users can view own overrides" ON public.user_permission_overrides;
CREATE POLICY "Users can view own overrides"
ON public.user_permission_overrides
FOR SELECT
USING (
  user_id = auth.uid()
  OR is_admin()
  OR check_permission(auth.uid(), 'admin.manage_users')
);