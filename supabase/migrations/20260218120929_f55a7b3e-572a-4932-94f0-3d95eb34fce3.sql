
-- Revoke all access from anon and authenticated roles to prevent API access
REVOKE ALL ON public.microsoft_tokens FROM anon, authenticated;
-- Only service_role (used by edge functions) retains access
GRANT ALL ON public.microsoft_tokens TO service_role;
