
-- Add Teams meeting columns to events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS meeting_join_url text,
  ADD COLUMN IF NOT EXISTS meeting_id text,
  ADD COLUMN IF NOT EXISTS meeting_created_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS meeting_created_by uuid;
