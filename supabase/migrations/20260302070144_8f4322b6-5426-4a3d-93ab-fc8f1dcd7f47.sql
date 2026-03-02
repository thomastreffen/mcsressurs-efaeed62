-- Add threading headers and normalized subject to case_items
ALTER TABLE public.case_items 
  ADD COLUMN IF NOT EXISTS subject_normalized text,
  ADD COLUMN IF NOT EXISTS in_reply_to text,
  ADD COLUMN IF NOT EXISTS references_header text;

-- Index for threading by in_reply_to and references
CREATE INDEX IF NOT EXISTS idx_case_items_in_reply_to ON public.case_items (in_reply_to) WHERE in_reply_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_case_items_internet_message_id ON public.case_items (internet_message_id) WHERE internet_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_case_items_subject_normalized ON public.case_items (subject_normalized) WHERE subject_normalized IS NOT NULL;