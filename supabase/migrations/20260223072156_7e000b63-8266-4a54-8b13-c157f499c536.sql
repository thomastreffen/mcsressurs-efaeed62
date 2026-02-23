
-- Create contract_cron_runs table for observability
CREATE TABLE public.contract_cron_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ran_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'ok',
  created_alerts_count integer NOT NULL DEFAULT 0,
  scanned_deadlines_count integer NOT NULL DEFAULT 0,
  notified_users_count integer NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  dry_run boolean NOT NULL DEFAULT false
);

-- Enable RLS
ALTER TABLE public.contract_cron_runs ENABLE ROW LEVEL SECURITY;

-- Only admins can read/manage cron runs
CREATE POLICY "Admins can manage cron runs"
  ON public.contract_cron_runs FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
