
-- Create job_approvals table
CREATE TABLE public.job_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  technician_user_id uuid NOT NULL,
  token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'reschedule_requested')),
  proposed_start timestamptz,
  proposed_end timestamptz,
  comment text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

-- Index on token for fast lookups
CREATE INDEX idx_job_approvals_token ON public.job_approvals(token);

-- Index on job_id for aggregation queries
CREATE INDEX idx_job_approvals_job_id ON public.job_approvals(job_id);

-- Disable RLS - only edge functions access this table
ALTER TABLE public.job_approvals ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (edge functions use service_role)
CREATE POLICY "Service role full access"
ON public.job_approvals
FOR ALL
USING (true)
WITH CHECK (true);
