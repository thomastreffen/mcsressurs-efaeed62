
-- ============================================================
-- RBAC Refactor: people, employment_profiles, user_accounts
-- ============================================================

-- 1. people table – one row per human
CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage people" ON public.people
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated can read people" ON public.people
  FOR SELECT TO authenticated
  USING (true);

-- 2. employment_profiles – operational personnel data
CREATE TABLE public.employment_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  department_id uuid REFERENCES public.departments(id),
  is_plannable_resource boolean NOT NULL DEFAULT false,
  color text,
  birth_date date,
  hms_card_number text,
  hms_card_expires_at date,
  trade_certificate_type text,
  driver_license_classes text,
  notes text,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(person_id, company_id)
);
ALTER TABLE public.employment_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage employment_profiles" ON public.employment_profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated can read employment_profiles" ON public.employment_profiles
  FOR SELECT TO authenticated
  USING (true);

-- 3. user_accounts – links a person to Supabase auth
CREATE TABLE public.user_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL UNIQUE,
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage user_accounts" ON public.user_accounts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated can read user_accounts" ON public.user_accounts
  FOR SELECT TO authenticated
  USING (true);

-- 4. permissions catalog
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  module text NOT NULL,
  description text
);
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read permissions" ON public.permissions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage permissions" ON public.permissions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. user_roles_v2 – maps user_accounts to roles with optional scope
CREATE TABLE public.user_roles_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_account_id uuid NOT NULL REFERENCES public.user_accounts(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  scope_company_id uuid REFERENCES public.internal_companies(id),
  scope_department_id uuid REFERENCES public.departments(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_account_id, role_id)
);
ALTER TABLE public.user_roles_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage user_roles_v2" ON public.user_roles_v2
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated read user_roles_v2" ON public.user_roles_v2
  FOR SELECT TO authenticated
  USING (true);

-- 6. user_scopes
CREATE TABLE public.user_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_account_id uuid NOT NULL REFERENCES public.user_accounts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  department_id uuid REFERENCES public.departments(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_account_id, company_id, department_id)
);
ALTER TABLE public.user_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage user_scopes" ON public.user_scopes
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated read user_scopes" ON public.user_scopes
  FOR SELECT TO authenticated
  USING (true);

-- 7. user_permission_overrides_v2
CREATE TABLE public.user_permission_overrides_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_account_id uuid NOT NULL REFERENCES public.user_accounts(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  scope_company_id uuid REFERENCES public.internal_companies(id),
  scope_department_id uuid REFERENCES public.departments(id),
  mode text NOT NULL DEFAULT 'allow' CHECK (mode IN ('allow', 'deny')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_account_id, permission_key)
);
ALTER TABLE public.user_permission_overrides_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage overrides_v2" ON public.user_permission_overrides_v2
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated read overrides_v2" ON public.user_permission_overrides_v2
  FOR SELECT TO authenticated
  USING (true);

-- 8. audit_log
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_account_id uuid REFERENCES public.user_accounts(id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit_log" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Authenticated can insert audit_log" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================
-- 9. Migrate data from technicians → people + employment_profiles + user_accounts
-- ============================================================

-- Insert into people from technicians (dedup by email)
INSERT INTO public.people (id, full_name, email, is_active, created_at)
SELECT
  t.id,
  t.name,
  t.email,
  (t.archived_at IS NULL),
  t.created_at
FROM public.technicians t
ON CONFLICT (email) DO NOTHING;

-- Insert employment_profiles
INSERT INTO public.employment_profiles (
  person_id, company_id, is_plannable_resource, color,
  birth_date, hms_card_number, hms_card_expires_at,
  trade_certificate_type, driver_license_classes, notes,
  archived_at, archived_by
)
SELECT
  p.id,
  COALESCE(
    (SELECT um.company_id FROM public.user_memberships um WHERE um.user_id = t.user_id AND um.is_active = true LIMIT 1),
    (SELECT ic.id FROM public.internal_companies ic WHERE ic.is_active = true ORDER BY ic.created_at LIMIT 1)
  ),
  t.is_plannable_resource,
  t.color,
  t.birth_date,
  t.hms_card_number,
  t.hms_card_expires_at,
  t.trade_certificate_type,
  t.driver_license_classes,
  t.notes,
  t.archived_at,
  t.archived_by
FROM public.technicians t
JOIN public.people p ON p.email = t.email;

-- Insert user_accounts
INSERT INTO public.user_accounts (person_id, auth_user_id, company_id, is_active)
SELECT
  p.id,
  t.user_id,
  COALESCE(
    (SELECT um.company_id FROM public.user_memberships um WHERE um.user_id = t.user_id AND um.is_active = true LIMIT 1),
    (SELECT ic.id FROM public.internal_companies ic WHERE ic.is_active = true ORDER BY ic.created_at LIMIT 1)
  ),
  (t.archived_at IS NULL)
FROM public.technicians t
JOIN public.people p ON p.email = t.email
WHERE t.user_id IS NOT NULL;

-- Migrate user_role_assignments → user_roles_v2
INSERT INTO public.user_roles_v2 (user_account_id, role_id)
SELECT ua.id, ura.role_id
FROM public.user_role_assignments ura
JOIN public.user_accounts ua ON ua.auth_user_id = ura.user_id
ON CONFLICT DO NOTHING;

-- Migrate user_memberships → user_scopes
INSERT INTO public.user_scopes (user_account_id, company_id, department_id)
SELECT ua.id, um.company_id, um.department_id
FROM public.user_memberships um
JOIN public.user_accounts ua ON ua.auth_user_id = um.user_id
WHERE um.is_active = true
ON CONFLICT DO NOTHING;

-- Migrate user_permission_overrides → user_permission_overrides_v2
INSERT INTO public.user_permission_overrides_v2 (user_account_id, permission_key, mode)
SELECT ua.id, upo.permission_key, CASE WHEN upo.allowed THEN 'allow' ELSE 'deny' END
FROM public.user_permission_overrides upo
JOIN public.user_accounts ua ON ua.auth_user_id = upo.user_id
ON CONFLICT DO NOTHING;

-- ============================================================
-- 10. technicians_v compatibility view
-- ============================================================

CREATE OR REPLACE VIEW public.technicians_v AS
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

-- ============================================================
-- 11. RBAC v2 functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_account_id(_auth_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.user_accounts
  WHERE auth_user_id = _auth_user_id AND is_active = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.check_permission_v2(_auth_user_id uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    -- 1. Check override first (v2)
    (SELECT CASE WHEN upo.mode = 'allow' THEN true ELSE false END
     FROM public.user_permission_overrides_v2 upo
     JOIN public.user_accounts ua ON ua.id = upo.user_account_id
     WHERE ua.auth_user_id = _auth_user_id AND ua.is_active = true
       AND upo.permission_key = _perm
     LIMIT 1),
    -- 2. Check role permissions via user_roles_v2
    (SELECT bool_or(rp.allowed)
     FROM public.user_roles_v2 urv
     JOIN public.user_accounts ua ON ua.id = urv.user_account_id
     JOIN public.role_permissions rp ON rp.role_id = urv.role_id
     WHERE ua.auth_user_id = _auth_user_id AND ua.is_active = true
       AND rp.permission_key = _perm),
    -- 3. Default false
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_scope_v2(_auth_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.check_permission_v2(_auth_user_id, 'scope.view.all') THEN 'all'
    WHEN public.check_permission_v2(_auth_user_id, 'scope.view.company') THEN 'company'
    ELSE 'own'
  END
$$;

CREATE OR REPLACE FUNCTION public.can_access_record_v2(
  _auth_user_id uuid,
  _record_company_id uuid,
  _record_department_id uuid,
  _record_created_by uuid,
  _record_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE public.get_user_scope_v2(_auth_user_id)
    WHEN 'all' THEN true
    WHEN 'company' THEN
      EXISTS (
        SELECT 1 FROM public.user_scopes us
        JOIN public.user_accounts ua ON ua.id = us.user_account_id
        WHERE ua.auth_user_id = _auth_user_id AND ua.is_active = true
          AND us.company_id = _record_company_id
          AND (us.department_id IS NULL OR us.department_id = _record_department_id OR _record_department_id IS NULL)
      )
    ELSE
      _record_created_by = _auth_user_id
      OR EXISTS (
        SELECT 1 FROM public.job_participants jp WHERE jp.job_id = _record_id AND jp.user_id = _auth_user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.event_technicians et
        JOIN public.technicians t ON t.id = et.technician_id
        WHERE et.event_id = _record_id AND t.user_id = _auth_user_id
      )
  END
$$;

-- Seed SharePoint permissions into catalog
INSERT INTO public.permissions (key, module, description) VALUES
  ('sharepoint.view', 'SharePoint', 'Se filer i SharePoint'),
  ('sharepoint.upload', 'SharePoint', 'Laste opp filer til SharePoint'),
  ('sharepoint.delete', 'SharePoint', 'Slette filer i SharePoint'),
  ('sharepoint.link_job', 'SharePoint', 'Koble jobb til SharePoint-mappe')
ON CONFLICT (key) DO NOTHING;
