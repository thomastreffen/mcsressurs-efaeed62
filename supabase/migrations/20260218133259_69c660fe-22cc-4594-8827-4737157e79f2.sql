
-- Create microsoft_tokens table
CREATE TABLE public.microsoft_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.microsoft_tokens ENABLE ROW LEVEL SECURITY;

-- No policies - only service_role access
REVOKE ALL ON public.microsoft_tokens FROM anon, authenticated;

-- Trigger for updated_at
CREATE TRIGGER update_microsoft_tokens_updated_at
  BEFORE UPDATE ON public.microsoft_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
