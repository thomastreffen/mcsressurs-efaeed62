
-- Add mention columns to case_items
ALTER TABLE public.case_items
  ADD COLUMN IF NOT EXISTS mentioned_emails text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mention_parse_version int NOT NULL DEFAULT 0;

-- GIN indexes for mention lookups
CREATE INDEX IF NOT EXISTS idx_case_items_mentioned_user_ids ON public.case_items USING GIN (mentioned_user_ids);
CREATE INDEX IF NOT EXISTS idx_case_items_mentioned_emails ON public.case_items USING GIN (mentioned_emails);

-- Add entity_type and entity_id to notifications for linking to cases/jobs/etc
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid;

-- Index for user unread notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, read, created_at DESC);
