
-- 1) Case ownership: assigned_to_user_id + assigned_at
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

-- 2) Case archival
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

-- 3) Source case traceability on calculations
ALTER TABLE public.calculations
  ADD COLUMN IF NOT EXISTS source_case_id uuid REFERENCES public.cases(id),
  ADD COLUMN IF NOT EXISTS source_case_item_id uuid REFERENCES public.case_items(id);

-- 4) Source case traceability on offers
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS source_case_id uuid REFERENCES public.cases(id),
  ADD COLUMN IF NOT EXISTS source_case_item_id uuid REFERENCES public.case_items(id);

-- 5) RLS: case owner/assigned can update
DROP POLICY IF EXISTS "Owner can update cases" ON public.cases;
CREATE POLICY "Owner or assigned can update cases" ON public.cases
  FOR UPDATE USING (
    owner_user_id = auth.uid()
    OR assigned_to_user_id = auth.uid()
    OR auth.uid() = ANY(participant_user_ids)
  );
