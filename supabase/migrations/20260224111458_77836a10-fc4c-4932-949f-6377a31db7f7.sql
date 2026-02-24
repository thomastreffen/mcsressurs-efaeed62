
-- Add archive support to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archived_by uuid DEFAULT NULL;
