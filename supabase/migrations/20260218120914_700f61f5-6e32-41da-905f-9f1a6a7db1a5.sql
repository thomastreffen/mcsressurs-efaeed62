
-- Drop existing policy and disable RLS entirely
DROP POLICY IF EXISTS "Service role full access" ON public.microsoft_tokens;
ALTER TABLE public.microsoft_tokens DISABLE ROW LEVEL SECURITY;
