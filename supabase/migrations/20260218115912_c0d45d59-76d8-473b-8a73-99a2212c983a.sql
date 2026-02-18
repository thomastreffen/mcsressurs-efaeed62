CREATE POLICY "Service role full access"
ON public.microsoft_tokens
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);