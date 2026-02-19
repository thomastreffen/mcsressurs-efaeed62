
-- Drop overly permissive policy
DROP POLICY IF EXISTS "Service role full access" ON public.job_approvals;

-- Create restrictive policy: only admins can read, no direct client writes
CREATE POLICY "Admins can view approvals"
ON public.job_approvals
FOR SELECT
USING (public.is_admin());

-- Edge functions use service_role which bypasses RLS entirely
