
-- 1) Add new lead statuses to enum
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'befaring' AFTER 'contacted';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'tilbud_sendt' AFTER 'qualified';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'forhandling' AFTER 'tilbud_sendt';

-- 2) Create next_action_type enum
DO $$ BEGIN
  CREATE TYPE public.lead_next_action_type AS ENUM ('call', 'email', 'meeting', 'site_visit', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Add new columns to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_owner_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS next_action_type public.lead_next_action_type,
  ADD COLUMN IF NOT EXISTS next_action_date timestamptz,
  ADD COLUMN IF NOT EXISTS next_action_note text;

-- Backfill assigned_owner_user_id from owner_id
UPDATE public.leads SET assigned_owner_user_id = owner_id WHERE assigned_owner_user_id IS NULL AND owner_id IS NOT NULL;

-- 4) Create lead_participants table
CREATE TABLE IF NOT EXISTS public.lead_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'contributor' CHECK (role IN ('owner', 'contributor', 'viewer')),
  notify_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lead_id, user_id)
);

ALTER TABLE public.lead_participants ENABLE ROW LEVEL SECURITY;

-- RLS for lead_participants
CREATE POLICY "Admins can manage lead_participants"
  ON public.lead_participants FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Participants can view own lead_participants"
  ON public.lead_participants FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- 5) Create lead_history table
CREATE TABLE IF NOT EXISTS public.lead_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  action text NOT NULL,
  description text,
  performed_by uuid REFERENCES auth.users(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage lead_history"
  ON public.lead_history FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Lead participants can view lead_history"
  ON public.lead_history FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.lead_participants lp
      WHERE lp.lead_id = lead_history.lead_id AND lp.user_id = auth.uid()
    )
  );

-- 6) Add new permission keys to default roles
-- leads.view, leads.create, leads.edit, leads.transfer_owner, leads.manage_participants, leads.convert
-- Add to Prosjektleder role
INSERT INTO public.role_permissions (role_id, permission_key, allowed)
SELECT r.id, perm.key, true
FROM public.roles r
CROSS JOIN (VALUES 
  ('leads.view'), ('leads.create'), ('leads.edit'), ('leads.transfer_owner'), ('leads.manage_participants'), ('leads.convert')
) AS perm(key)
WHERE r.name = 'Prosjektleder'
ON CONFLICT DO NOTHING;

-- Add to Planlegger/Admin role
INSERT INTO public.role_permissions (role_id, permission_key, allowed)
SELECT r.id, perm.key, true
FROM public.roles r
CROSS JOIN (VALUES 
  ('leads.view'), ('leads.create'), ('leads.edit'), ('leads.transfer_owner'), ('leads.manage_participants'), ('leads.convert')
) AS perm(key)
WHERE r.name = 'Planlegger/Admin'
ON CONFLICT DO NOTHING;

-- Add leads.view to Montør
INSERT INTO public.role_permissions (role_id, permission_key, allowed)
SELECT r.id, 'leads.view', true
FROM public.roles r
WHERE r.name = 'Montør'
ON CONFLICT DO NOTHING;

-- Add all leads permissions to Superadmin
INSERT INTO public.role_permissions (role_id, permission_key, allowed)
SELECT r.id, perm.key, true
FROM public.roles r
CROSS JOIN (VALUES 
  ('leads.view'), ('leads.create'), ('leads.edit'), ('leads.transfer_owner'), ('leads.manage_participants'), ('leads.convert')
) AS perm(key)
WHERE r.name = 'Superadmin'
ON CONFLICT DO NOTHING;

-- 7) Update leads RLS to support participant-based access
DROP POLICY IF EXISTS "Admins can manage leads" ON public.leads;

CREATE POLICY "Leads access by scope"
  ON public.leads FOR SELECT
  USING (
    public.is_admin()
    OR (
      CASE public.get_user_scope(auth.uid())
        WHEN 'all' THEN true
        WHEN 'company' THEN
          EXISTS (
            SELECT 1 FROM public.user_memberships um
            WHERE um.user_id = auth.uid()
              AND um.company_id = leads.company_id
              AND um.is_active = true
          )
        ELSE
          assigned_owner_user_id = auth.uid()
          OR owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.lead_participants lp
            WHERE lp.lead_id = leads.id AND lp.user_id = auth.uid()
          )
      END
    )
  );

CREATE POLICY "Leads insert by permission"
  ON public.leads FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR public.check_permission(auth.uid(), 'leads.create')
  );

CREATE POLICY "Leads update by permission"
  ON public.leads FOR UPDATE
  USING (
    public.is_admin()
    OR (
      public.check_permission(auth.uid(), 'leads.edit')
      AND (
        CASE public.get_user_scope(auth.uid())
          WHEN 'all' THEN true
          WHEN 'company' THEN
            EXISTS (
              SELECT 1 FROM public.user_memberships um
              WHERE um.user_id = auth.uid()
                AND um.company_id = leads.company_id
                AND um.is_active = true
            )
          ELSE
            assigned_owner_user_id = auth.uid()
            OR owner_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.lead_participants lp
              WHERE lp.lead_id = leads.id AND lp.user_id = auth.uid()
            )
        END
      )
    )
  );

CREATE POLICY "Leads delete by admin"
  ON public.leads FOR DELETE
  USING (public.is_admin());
