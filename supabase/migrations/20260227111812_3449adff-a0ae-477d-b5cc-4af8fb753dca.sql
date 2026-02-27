
-- 1) Case number sequence and column
CREATE SEQUENCE IF NOT EXISTS public.case_number_seq START WITH 1 INCREMENT BY 1;

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS case_number text UNIQUE;

-- 2) Auto-generate case_number on insert
CREATE OR REPLACE FUNCTION public.generate_case_number()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.case_number IS NULL OR NEW.case_number = '' THEN
    NEW.case_number := 'CASE-' || LPAD(nextval('public.case_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_generate_case_number ON public.cases;
CREATE TRIGGER trg_generate_case_number
  BEFORE INSERT ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_case_number();

-- 3) Last activity tracking
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_activity_by_user_id uuid;

-- 4) Backfill existing cases with case_number
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.cases WHERE case_number IS NULL ORDER BY created_at
  LOOP
    UPDATE public.cases
    SET case_number = 'CASE-' || LPAD(nextval('public.case_number_seq')::text, 6, '0')
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- 5) Make case_number NOT NULL after backfill
ALTER TABLE public.cases ALTER COLUMN case_number SET NOT NULL;
ALTER TABLE public.cases ALTER COLUMN case_number SET DEFAULT '';
