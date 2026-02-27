
-- Add new columns to case_items for full email storage
ALTER TABLE public.case_items 
ADD COLUMN IF NOT EXISTS body_text text,
ADD COLUMN IF NOT EXISTS from_name text,
ADD COLUMN IF NOT EXISTS sent_at timestamptz,
ADD COLUMN IF NOT EXISTS internet_message_id text,
ADD COLUMN IF NOT EXISTS conversation_id text,
ADD COLUMN IF NOT EXISTS cc_emails text[],
ADD COLUMN IF NOT EXISTS attachments_meta jsonb DEFAULT '[]'::jsonb;

-- Index for thread grouping
CREATE INDEX IF NOT EXISTS idx_case_items_conversation_id ON public.case_items(conversation_id) WHERE conversation_id IS NOT NULL;

-- Create email-attachments bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('email-attachments', 'email-attachments', false)
ON CONFLICT (id) DO NOTHING;
