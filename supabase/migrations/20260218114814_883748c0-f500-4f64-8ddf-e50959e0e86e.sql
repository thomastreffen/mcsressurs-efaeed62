
-- Re-enable RLS (satisfies linter) but remove all policies
-- so only service_role (which bypasses RLS) can access
ALTER TABLE public.microsoft_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policies that were blocking service role
DROP POLICY IF EXISTS "Service role manages tokens" ON public.microsoft_tokens;
DROP POLICY IF EXISTS "Users can view own tokens" ON public.microsoft_tokens;
