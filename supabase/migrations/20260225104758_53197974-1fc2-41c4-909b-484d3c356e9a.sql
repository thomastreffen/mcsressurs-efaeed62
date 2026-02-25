
-- Extend user_documents with AI parsing fields
ALTER TABLE public.user_documents
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS extracted_fields_json jsonb,
  ADD COLUMN IF NOT EXISTS confirmed_fields_json jsonb,
  ADD COLUMN IF NOT EXISTS confidence_json jsonb,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_processed_at timestamptz;
