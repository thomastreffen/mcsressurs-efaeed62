
-- Add is_read column for unread tracking on case_items
ALTER TABLE public.case_items
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

-- Index for efficient unread queries per case
CREATE INDEX IF NOT EXISTS idx_case_items_case_is_read
  ON public.case_items (case_id, is_read)
  WHERE is_read = false;
