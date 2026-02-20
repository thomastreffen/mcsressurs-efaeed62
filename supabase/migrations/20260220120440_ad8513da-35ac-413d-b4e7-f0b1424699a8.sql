-- Add idempotency and linking fields to communication_logs
ALTER TABLE public.communication_logs
  ADD COLUMN IF NOT EXISTS send_hash text,
  ADD COLUMN IF NOT EXISTS last_operation_id uuid,
  ADD COLUMN IF NOT EXISTS last_operation_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error jsonb,
  ADD COLUMN IF NOT EXISTS ref_code text;

-- Index for fast duplicate detection
CREATE INDEX IF NOT EXISTS idx_comm_logs_send_hash 
  ON public.communication_logs (send_hash, mode, created_at DESC)
  WHERE send_hash IS NOT NULL;

-- Index for ref_code lookups
CREATE INDEX IF NOT EXISTS idx_comm_logs_ref_code 
  ON public.communication_logs (ref_code)
  WHERE ref_code IS NOT NULL;