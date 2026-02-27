
-- Drop existing SELECT policies on cases
DROP POLICY IF EXISTS "Team can view company-scoped cases" ON public.cases;
DROP POLICY IF EXISTS "Private case access" ON public.cases;

-- New: Company-scoped cases visible to postkontor roles + admin
CREATE POLICY "Postkontor users can view company cases"
ON public.cases
FOR SELECT
USING (
  scope = 'company'::case_scope
  AND (
    is_admin()
    OR (
      check_permission(auth.uid(), 'postkontor.view')
      AND EXISTS (
        SELECT 1 FROM public.user_memberships um
        WHERE um.user_id = auth.uid()
          AND um.company_id = cases.company_id
          AND um.is_active = true
      )
    )
  )
);

-- Private cases: only owner/participants/admin
CREATE POLICY "Private case access"
ON public.cases
FOR SELECT
USING (
  scope = 'private'::case_scope
  AND (
    is_admin()
    OR owner_user_id = auth.uid()
    OR auth.uid() = ANY(participant_user_ids)
  )
);

-- Drop existing SELECT policy on case_items
DROP POLICY IF EXISTS "Users can view case_items via case" ON public.case_items;

-- New: case_items visible only to postkontor roles + admin + owner/participants
CREATE POLICY "Postkontor users can view case_items"
ON public.case_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = case_items.case_id
    AND (
      is_admin()
      OR (
        c.scope = 'company'::case_scope
        AND check_permission(auth.uid(), 'postkontor.view')
        AND EXISTS (
          SELECT 1 FROM public.user_memberships um
          WHERE um.user_id = auth.uid()
            AND um.company_id = c.company_id
            AND um.is_active = true
        )
      )
      OR (
        c.scope = 'private'::case_scope
        AND (
          c.owner_user_id = auth.uid()
          OR auth.uid() = ANY(c.participant_user_ids)
        )
      )
    )
  )
);

-- Update INSERT policy on case_items to also require postkontor.view
DROP POLICY IF EXISTS "Participants can insert case_items" ON public.case_items;

CREATE POLICY "Postkontor users can insert case_items"
ON public.case_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = case_items.case_id
    AND (
      is_admin()
      OR (
        check_permission(auth.uid(), 'postkontor.view')
        AND (
          c.owner_user_id = auth.uid()
          OR auth.uid() = ANY(c.participant_user_ids)
          OR (c.scope = 'company'::case_scope AND EXISTS (
            SELECT 1 FROM public.user_memberships um
            WHERE um.user_id = auth.uid() AND um.company_id = c.company_id AND um.is_active = true
          ))
        )
      )
    )
  )
);

-- Also restrict case_routing_rules view to postkontor users
DROP POLICY IF EXISTS "Auth users can view routing rules" ON public.case_routing_rules;

CREATE POLICY "Postkontor users can view routing rules"
ON public.case_routing_rules
FOR SELECT
USING (
  is_admin() OR check_permission(auth.uid(), 'postkontor.view')
);
