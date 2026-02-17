
-- Store Microsoft tokens for Graph API access
CREATE TABLE public.microsoft_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.microsoft_tokens ENABLE ROW LEVEL SECURITY;

-- Only the user themselves can see their own tokens
CREATE POLICY "Users can view own tokens"
ON public.microsoft_tokens FOR SELECT
USING (auth.uid() = user_id);

-- Service role inserts/updates via edge functions
CREATE POLICY "Service role manages tokens"
ON public.microsoft_tokens FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_microsoft_tokens_updated_at
BEFORE UPDATE ON public.microsoft_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
