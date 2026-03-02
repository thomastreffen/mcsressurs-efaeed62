
-- Fix security definer view by making it SECURITY INVOKER
DROP VIEW IF EXISTS public.technicians_v;
CREATE VIEW public.technicians_v
WITH (security_invoker = true)
AS
SELECT
  p.id,
  ua.auth_user_id AS user_id,
  p.full_name AS name,
  p.email,
  ep.color,
  ep.is_plannable_resource,
  ep.birth_date,
  ep.hms_card_number,
  ep.hms_card_expires_at,
  ep.trade_certificate_type,
  ep.driver_license_classes,
  ep.notes,
  ep.archived_at,
  ep.archived_by,
  ep.company_id,
  ep.department_id,
  p.created_at
FROM public.people p
LEFT JOIN public.employment_profiles ep ON ep.person_id = p.id
LEFT JOIN public.user_accounts ua ON ua.person_id = p.id;

-- Fix audit_log insert policy to require authenticated user match
DROP POLICY IF EXISTS "Authenticated can insert audit_log" ON public.audit_log;
CREATE POLICY "Authenticated can insert audit_log" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_account_id IS NULL 
    OR actor_user_account_id IN (
      SELECT id FROM public.user_accounts WHERE auth_user_id = auth.uid()
    )
  );
