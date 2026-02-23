
-- Add soft delete columns to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text NULL;

-- Add soft delete columns to contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text NULL;

-- Add delete_reason to events (already has deleted_at/deleted_by)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS delete_reason text NULL;

-- Add delete_reason to calculations (already has deleted_at/deleted_by)
ALTER TABLE public.calculations
  ADD COLUMN IF NOT EXISTS delete_reason text NULL;

-- Add delete_reason to offers (already has deleted_at/deleted_by)
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS delete_reason text NULL;

-- Add dry_run column to contract_cron_runs if missing
-- (already exists from prior migration)
