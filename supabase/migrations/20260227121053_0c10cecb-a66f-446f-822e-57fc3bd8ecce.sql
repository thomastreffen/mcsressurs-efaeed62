
-- 1) Add 'in_progress' to case_status enum (keeping 'assigned' and 'archived' for backward compat)
ALTER TYPE public.case_status ADD VALUE IF NOT EXISTS 'in_progress';

-- 2) Create resolution_type enum
DO $$ BEGIN
  CREATE TYPE public.case_resolution_type AS ENUM (
    'converted_to_offer',
    'converted_to_project',
    'converted_to_service',
    'converted_to_lead',
    'resolved_email_only',
    'rejected',
    'spam',
    'duplicate'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Add resolution_type and linked entity columns to cases
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS resolution_type text,
  ADD COLUMN IF NOT EXISTS linked_offer_id uuid REFERENCES public.offers(id),
  ADD COLUMN IF NOT EXISTS linked_project_id uuid REFERENCES public.events(id),
  ADD COLUMN IF NOT EXISTS linked_work_order_id uuid REFERENCES public.work_orders(id),
  ADD COLUMN IF NOT EXISTS linked_lead_id uuid REFERENCES public.leads(id);
