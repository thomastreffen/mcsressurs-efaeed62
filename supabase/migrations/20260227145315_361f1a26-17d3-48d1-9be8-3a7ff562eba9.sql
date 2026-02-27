-- Add AI classification fields and source tracking to documents
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS ai_category text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS ai_classified_at timestamptz;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS ai_confidence real;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual';
-- source_type: 'manual' (user upload), 'email' (from inbox-sync attachment)
-- ai_category matches existing category values: image, drawing, fdv, other, offer, contract

COMMENT ON COLUMN public.documents.ai_category IS 'AI-assigned category: image, drawing, fdv, other, offer, contract';
COMMENT ON COLUMN public.documents.source_type IS 'Origin: manual (user upload) or email (auto-extracted from email attachment)';