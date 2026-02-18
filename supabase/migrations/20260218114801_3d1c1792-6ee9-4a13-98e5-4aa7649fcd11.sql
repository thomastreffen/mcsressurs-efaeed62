
-- microsoft_tokens is an internal system table managed only by edge functions via service role.
-- Disable RLS since no client-side access is needed.
ALTER TABLE public.microsoft_tokens DISABLE ROW LEVEL SECURITY;
