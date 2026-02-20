
-- 1. Add content_hash to offers for versioning dedup
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS content_hash text;

-- 2. Add soft delete fields to events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- 3. Add soft delete fields to offers
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- 4. Add soft delete fields to calculations
ALTER TABLE public.calculations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.calculations ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- 5. Add archive fields to events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS archived_by uuid;

-- 6. Add archive fields to offers
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS archived_by uuid;

-- 7. Add 'signed' and 'archived' to offer_status enum
ALTER TYPE public.offer_status ADD VALUE IF NOT EXISTS 'signed';
ALTER TYPE public.offer_status ADD VALUE IF NOT EXISTS 'archived';

-- 8. Add 'archived' to job_status enum
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'archived';

-- 9. Add default settings rows (hourly_rate, km_rate, material_markup, signature_block, offer_texts)
INSERT INTO public.settings (key, value) VALUES
  ('default_hourly_rate', '"1080"')
ON CONFLICT DO NOTHING;

INSERT INTO public.settings (key, value) VALUES
  ('default_km_rate', '"4.50"')
ON CONFLICT DO NOTHING;

INSERT INTO public.settings (key, value) VALUES
  ('default_material_markup', '"2.0"')
ON CONFLICT DO NOTHING;

INSERT INTO public.settings (key, value) VALUES
  ('default_signature_block', '"For [firmanavn]\nDato: _______________\nSignatur: _______________"')
ON CONFLICT DO NOTHING;

INSERT INTO public.settings (key, value) VALUES
  ('default_offer_exclusions', '"Graving og grunnarbeid er ikke inkludert med mindre spesifisert.\nBygningsmessige tilpasninger (hulltaking, branntetning etc.) utføres av andre med mindre avtalt.\nStrømforsyning fram til tilkoblingspunkt forutsettes levert av netteier/andre.\nDokumentasjon ut over standard FDV er ikke inkludert."')
ON CONFLICT DO NOTHING;

-- 10. Add indexes for soft delete queries
CREATE INDEX IF NOT EXISTS idx_events_deleted_at ON public.events(deleted_at);
CREATE INDEX IF NOT EXISTS idx_offers_deleted_at ON public.offers(deleted_at);
CREATE INDEX IF NOT EXISTS idx_calculations_deleted_at ON public.calculations(deleted_at);
CREATE INDEX IF NOT EXISTS idx_offers_content_hash ON public.offers(content_hash);
