
-- 1. Create new extended job status enum
CREATE TYPE public.job_status AS ENUM (
  'requested',
  'approved',
  'time_change_proposed',
  'rejected',
  'scheduled',
  'in_progress',
  'completed',
  'ready_for_invoicing',
  'invoiced'
);

-- 2. Add job_number and internal_number columns
ALTER TABLE public.events ADD COLUMN job_number text;
ALTER TABLE public.events ADD COLUMN internal_number text;

-- 3. Create sequence for auto-generating internal numbers
CREATE SEQUENCE public.job_internal_number_seq START 1;

-- 4. Add new status column with the new enum
ALTER TABLE public.events ADD COLUMN new_status job_status NOT NULL DEFAULT 'requested';

-- 5. Migrate existing statuses to new enum values
UPDATE public.events SET new_status = CASE status
  WHEN 'pending' THEN 'requested'::job_status
  WHEN 'accepted' THEN 'approved'::job_status
  WHEN 'declined' THEN 'rejected'::job_status
  WHEN 'change_request' THEN 'time_change_proposed'::job_status
  ELSE 'requested'::job_status
END;

-- 6. Drop old status column and rename new one
ALTER TABLE public.events DROP COLUMN status;
ALTER TABLE public.events RENAME COLUMN new_status TO status;

-- 7. Trigger to auto-generate internal_number on insert
CREATE OR REPLACE FUNCTION public.generate_internal_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.internal_number IS NULL THEN
    NEW.internal_number := 'JOB-' || LPAD(nextval('public.job_internal_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_internal_number
BEFORE INSERT ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.generate_internal_number();

-- 8. Create a view/function for display_number (job_number takes precedence)
-- We'll handle this in application code: COALESCE(job_number, internal_number)
