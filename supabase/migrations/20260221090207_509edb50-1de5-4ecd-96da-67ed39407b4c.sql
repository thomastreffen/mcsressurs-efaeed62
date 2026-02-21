
-- Add usage_count to regulation_queries for tracking reuse of approved templates
ALTER TABLE public.regulation_queries
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0;

-- Add regulation.review permission to the system for roles that need it
-- (We use the existing permission system - admins already have full access)
INSERT INTO public.role_permissions (role_id, permission_key, allowed)
SELECT r.id, 'regulation.review', true
FROM public.roles r
WHERE r.name IN ('Admin', 'Super Admin', 'admin', 'super_admin')
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp 
    WHERE rp.role_id = r.id AND rp.permission_key = 'regulation.review'
  );
