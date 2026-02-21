
-- Add orphan tracking fields to regulation_queries
ALTER TABLE public.regulation_queries
  ADD COLUMN IF NOT EXISTS is_orphan boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orphan_reason text,
  ADD COLUMN IF NOT EXISTS orphan_detected_at timestamptz;

-- Add orphan tracking fields to communication_logs
ALTER TABLE public.communication_logs
  ADD COLUMN IF NOT EXISTS is_orphan boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orphan_reason text,
  ADD COLUMN IF NOT EXISTS orphan_detected_at timestamptz;

-- Add orphan tracking fields to job_calendar_links
ALTER TABLE public.job_calendar_links
  ADD COLUMN IF NOT EXISTS is_orphan boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orphan_reason text,
  ADD COLUMN IF NOT EXISTS orphan_detected_at timestamptz;

-- Add indexes for efficient orphan queries
CREATE INDEX IF NOT EXISTS idx_regulation_queries_orphan ON public.regulation_queries (is_orphan) WHERE is_orphan = true;
CREATE INDEX IF NOT EXISTS idx_communication_logs_orphan ON public.communication_logs (is_orphan) WHERE is_orphan = true;
CREATE INDEX IF NOT EXISTS idx_job_calendar_links_orphan ON public.job_calendar_links (is_orphan) WHERE is_orphan = true;
