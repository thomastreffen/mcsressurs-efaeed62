
-- =============================================================
-- MULTI-COMPANY, DEPARTMENTS & PERMISSION SYSTEM
-- =============================================================

-- 1) INTERNAL COMPANIES
CREATE TABLE public.internal_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  org_number text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.internal_companies ENABLE ROW LEVEL SECURITY;

-- 2) DEPARTMENTS
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- 3) USER MEMBERSHIPS
CREATE TABLE public.user_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id, department_id)
);
ALTER TABLE public.user_memberships ENABLE ROW LEVEL SECURITY;

-- 4) ROLES (permission-based)
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_system_role boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- 5) ROLE PERMISSIONS
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  UNIQUE(role_id, permission_key)
);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- 6) USER ROLE ASSIGNMENTS (link user to new roles table)
CREATE TABLE public.user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role_id)
);
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

-- 7) USER PERMISSION OVERRIDES
CREATE TABLE public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission_key text NOT NULL,
  allowed boolean NOT NULL,
  UNIQUE(user_id, permission_key)
);
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

-- 8) JOB PARTICIPANTS
CREATE TABLE public.job_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, user_id)
);
ALTER TABLE public.job_participants ENABLE ROW LEVEL SECURITY;

-- 9) ADD company_id + department_id TO CORE TABLES
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.internal_companies(id),
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id);

ALTER TABLE public.calculations
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.internal_companies(id),
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id);

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.internal_companies(id),
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.internal_companies(id),
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id);

-- 10) PERMISSION HELPER FUNCTIONS

-- Check effective permission: override > role > false
CREATE OR REPLACE FUNCTION public.check_permission(_user_id uuid, _perm text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- 1. Check override first
    (SELECT allowed FROM public.user_permission_overrides
     WHERE user_id = _user_id AND permission_key = _perm LIMIT 1),
    -- 2. Check role permissions (any role grants it)
    (SELECT bool_or(rp.allowed) FROM public.user_role_assignments ura
     JOIN public.role_permissions rp ON rp.role_id = ura.role_id
     WHERE ura.user_id = _user_id AND rp.permission_key = _perm),
    -- 3. Default false
    false
  )
$$;

-- Get effective scope level: 'all' > 'company' > 'own'
CREATE OR REPLACE FUNCTION public.get_user_scope(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.check_permission(_user_id, 'scope.view.all') THEN 'all'
    WHEN public.check_permission(_user_id, 'scope.view.company') THEN 'company'
    ELSE 'own'
  END
$$;

-- Check if user can access a record based on scope + membership + participation
CREATE OR REPLACE FUNCTION public.can_access_record(
  _user_id uuid,
  _record_company_id uuid,
  _record_department_id uuid,
  _record_created_by uuid,
  _record_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE public.get_user_scope(_user_id)
    WHEN 'all' THEN true
    WHEN 'company' THEN
      -- User has membership in the same company
      EXISTS (
        SELECT 1 FROM public.user_memberships um
        WHERE um.user_id = _user_id
          AND um.company_id = _record_company_id
          AND um.is_active = true
          AND (
            -- Company-wide membership (department_id IS NULL) sees all departments
            um.department_id IS NULL
            -- Or department-specific membership must match
            OR um.department_id = _record_department_id
            -- Or record has no department
            OR _record_department_id IS NULL
          )
      )
    ELSE
      -- 'own': created_by OR participant
      _record_created_by = _user_id
      OR EXISTS (
        SELECT 1 FROM public.job_participants jp
        WHERE jp.job_id = _record_id AND jp.user_id = _user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.event_technicians et
        JOIN public.technicians t ON t.id = et.technician_id
        WHERE et.event_id = _record_id AND t.user_id = _user_id
      )
  END
$$;

-- Backward compat: update is_admin to also check new permission system
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.check_permission(auth.uid(), 'admin.manage_users')
$$;

-- 11) SEED COMPANIES
INSERT INTO public.internal_companies (id, name, org_number, is_active)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'MCS Service AS', NULL, true),
  ('a0000000-0000-0000-0000-000000000002', 'MCS Elektrotavler AS', NULL, true);

-- 12) SEED ROLES
INSERT INTO public.roles (id, name, description, is_system_role) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Montør', 'Tekniker med begrenset tilgang', true),
  ('b0000000-0000-0000-0000-000000000002', 'Prosjektleder', 'Prosjektleder med firmatilgang', true),
  ('b0000000-0000-0000-0000-000000000003', 'Planlegger/Admin', 'Full jobb- og kalenderkontroll', true),
  ('b0000000-0000-0000-0000-000000000004', 'Superadmin', 'Full tilgang til alt', true);

-- 13) SEED ROLE PERMISSIONS
-- Montør
INSERT INTO public.role_permissions (role_id, permission_key, allowed) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'scope.view.own', true),
  ('b0000000-0000-0000-0000-000000000001', 'jobs.view', true),
  ('b0000000-0000-0000-0000-000000000001', 'jobs.edit', true),
  ('b0000000-0000-0000-0000-000000000001', 'docs.view', true),
  ('b0000000-0000-0000-0000-000000000001', 'docs.upload', true),
  ('b0000000-0000-0000-0000-000000000001', 'docs.restrict_to_participants', true),
  ('b0000000-0000-0000-0000-000000000001', 'comm.view', true),
  ('b0000000-0000-0000-0000-000000000001', 'comm.create_note', true),
  ('b0000000-0000-0000-0000-000000000001', 'comm.restrict_to_participants', true),
  ('b0000000-0000-0000-0000-000000000001', 'calendar.read_busy', true);

-- Prosjektleder
INSERT INTO public.role_permissions (role_id, permission_key, allowed) VALUES
  ('b0000000-0000-0000-0000-000000000002', 'scope.view.company', true),
  ('b0000000-0000-0000-0000-000000000002', 'jobs.view', true),
  ('b0000000-0000-0000-0000-000000000002', 'jobs.create', true),
  ('b0000000-0000-0000-0000-000000000002', 'jobs.edit', true),
  ('b0000000-0000-0000-0000-000000000002', 'jobs.assign_users', true),
  ('b0000000-0000-0000-0000-000000000002', 'jobs.archive', true),
  ('b0000000-0000-0000-0000-000000000002', 'jobs.view_pricing', true),
  ('b0000000-0000-0000-0000-000000000002', 'offers.view', true),
  ('b0000000-0000-0000-0000-000000000002', 'offers.create', true),
  ('b0000000-0000-0000-0000-000000000002', 'offers.edit', true),
  ('b0000000-0000-0000-0000-000000000002', 'calc.view', true),
  ('b0000000-0000-0000-0000-000000000002', 'calc.edit', true),
  ('b0000000-0000-0000-0000-000000000002', 'docs.view', true),
  ('b0000000-0000-0000-0000-000000000002', 'comm.view', true),
  ('b0000000-0000-0000-0000-000000000002', 'calendar.write_events', true);

-- Planlegger/Admin
INSERT INTO public.role_permissions (role_id, permission_key, allowed) VALUES
  ('b0000000-0000-0000-0000-000000000003', 'scope.view.company', true),
  ('b0000000-0000-0000-0000-000000000003', 'jobs.view', true),
  ('b0000000-0000-0000-0000-000000000003', 'jobs.create', true),
  ('b0000000-0000-0000-0000-000000000003', 'jobs.edit', true),
  ('b0000000-0000-0000-0000-000000000003', 'jobs.delete', true),
  ('b0000000-0000-0000-0000-000000000003', 'jobs.archive', true),
  ('b0000000-0000-0000-0000-000000000003', 'jobs.assign_users', true),
  ('b0000000-0000-0000-0000-000000000003', 'jobs.view_pricing', true),
  ('b0000000-0000-0000-0000-000000000003', 'offers.view', true),
  ('b0000000-0000-0000-0000-000000000003', 'offers.create', true),
  ('b0000000-0000-0000-0000-000000000003', 'offers.edit', true),
  ('b0000000-0000-0000-0000-000000000003', 'offers.delete', true),
  ('b0000000-0000-0000-0000-000000000003', 'offers.archive', true),
  ('b0000000-0000-0000-0000-000000000003', 'calc.view', true),
  ('b0000000-0000-0000-0000-000000000003', 'calc.edit', true),
  ('b0000000-0000-0000-0000-000000000003', 'docs.view', true),
  ('b0000000-0000-0000-0000-000000000003', 'docs.upload', true),
  ('b0000000-0000-0000-0000-000000000003', 'docs.delete', true),
  ('b0000000-0000-0000-0000-000000000003', 'comm.view', true),
  ('b0000000-0000-0000-0000-000000000003', 'comm.create_note', true),
  ('b0000000-0000-0000-0000-000000000003', 'comm.delete_note', true),
  ('b0000000-0000-0000-0000-000000000003', 'calendar.write_events', true),
  ('b0000000-0000-0000-0000-000000000003', 'calendar.delete_events', true);

-- Superadmin
INSERT INTO public.role_permissions (role_id, permission_key, allowed) VALUES
  ('b0000000-0000-0000-0000-000000000004', 'scope.view.all', true),
  ('b0000000-0000-0000-0000-000000000004', 'jobs.view', true),
  ('b0000000-0000-0000-0000-000000000004', 'jobs.create', true),
  ('b0000000-0000-0000-0000-000000000004', 'jobs.edit', true),
  ('b0000000-0000-0000-0000-000000000004', 'jobs.delete', true),
  ('b0000000-0000-0000-0000-000000000004', 'jobs.archive', true),
  ('b0000000-0000-0000-0000-000000000004', 'jobs.assign_users', true),
  ('b0000000-0000-0000-0000-000000000004', 'jobs.view_pricing', true),
  ('b0000000-0000-0000-0000-000000000004', 'offers.view', true),
  ('b0000000-0000-0000-0000-000000000004', 'offers.create', true),
  ('b0000000-0000-0000-0000-000000000004', 'offers.edit', true),
  ('b0000000-0000-0000-0000-000000000004', 'offers.delete', true),
  ('b0000000-0000-0000-0000-000000000004', 'offers.archive', true),
  ('b0000000-0000-0000-0000-000000000004', 'calc.view', true),
  ('b0000000-0000-0000-0000-000000000004', 'calc.edit', true),
  ('b0000000-0000-0000-0000-000000000004', 'docs.view', true),
  ('b0000000-0000-0000-0000-000000000004', 'docs.upload', true),
  ('b0000000-0000-0000-0000-000000000004', 'docs.delete', true),
  ('b0000000-0000-0000-0000-000000000004', 'comm.view', true),
  ('b0000000-0000-0000-0000-000000000004', 'comm.create_note', true),
  ('b0000000-0000-0000-0000-000000000004', 'comm.delete_note', true),
  ('b0000000-0000-0000-0000-000000000004', 'calendar.read_busy', true),
  ('b0000000-0000-0000-0000-000000000004', 'calendar.write_events', true),
  ('b0000000-0000-0000-0000-000000000004', 'calendar.delete_events', true),
  ('b0000000-0000-0000-0000-000000000004', 'admin.manage_companies', true),
  ('b0000000-0000-0000-0000-000000000004', 'admin.manage_departments', true),
  ('b0000000-0000-0000-0000-000000000004', 'admin.manage_users', true),
  ('b0000000-0000-0000-0000-000000000004', 'admin.manage_roles', true),
  ('b0000000-0000-0000-0000-000000000004', 'admin.manage_settings', true);

-- 14) ASSIGN EXISTING RECORDS TO MCS Service AS
UPDATE public.events SET company_id = 'a0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.calculations SET company_id = 'a0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.offers SET company_id = 'a0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.leads SET company_id = 'a0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;

-- 15) INDEXES
CREATE INDEX idx_user_memberships_user ON public.user_memberships(user_id);
CREATE INDEX idx_user_memberships_company ON public.user_memberships(company_id);
CREATE INDEX idx_user_role_assignments_user ON public.user_role_assignments(user_id);
CREATE INDEX idx_role_permissions_role ON public.role_permissions(role_id);
CREATE INDEX idx_job_participants_job ON public.job_participants(job_id);
CREATE INDEX idx_job_participants_user ON public.job_participants(user_id);
CREATE INDEX idx_events_company ON public.events(company_id);
CREATE INDEX idx_calculations_company ON public.calculations(company_id);
CREATE INDEX idx_offers_company ON public.offers(company_id);
CREATE INDEX idx_leads_company ON public.leads(company_id);

-- 16) RLS POLICIES FOR NEW TABLES

-- internal_companies: admins manage, authenticated view
CREATE POLICY "Authenticated can view active companies"
  ON public.internal_companies FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage companies"
  ON public.internal_companies FOR ALL
  USING (public.check_permission(auth.uid(), 'admin.manage_companies'))
  WITH CHECK (public.check_permission(auth.uid(), 'admin.manage_companies'));

-- departments
CREATE POLICY "Authenticated can view active departments"
  ON public.departments FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage departments"
  ON public.departments FOR ALL
  USING (public.check_permission(auth.uid(), 'admin.manage_departments'))
  WITH CHECK (public.check_permission(auth.uid(), 'admin.manage_departments'));

-- user_memberships
CREATE POLICY "Users can view own memberships"
  ON public.user_memberships FOR SELECT
  USING (user_id = auth.uid() OR public.check_permission(auth.uid(), 'admin.manage_users'));

CREATE POLICY "Admins can manage memberships"
  ON public.user_memberships FOR ALL
  USING (public.check_permission(auth.uid(), 'admin.manage_users'))
  WITH CHECK (public.check_permission(auth.uid(), 'admin.manage_users'));

-- roles
CREATE POLICY "Authenticated can view roles"
  ON public.roles FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage roles"
  ON public.roles FOR ALL
  USING (public.check_permission(auth.uid(), 'admin.manage_roles'))
  WITH CHECK (public.check_permission(auth.uid(), 'admin.manage_roles'));

-- role_permissions
CREATE POLICY "Authenticated can view role_permissions"
  ON public.role_permissions FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage role_permissions"
  ON public.role_permissions FOR ALL
  USING (public.check_permission(auth.uid(), 'admin.manage_roles'))
  WITH CHECK (public.check_permission(auth.uid(), 'admin.manage_roles'));

-- user_role_assignments
CREATE POLICY "Users can view own assignments"
  ON public.user_role_assignments FOR SELECT
  USING (user_id = auth.uid() OR public.check_permission(auth.uid(), 'admin.manage_users'));

CREATE POLICY "Admins can manage role assignments"
  ON public.user_role_assignments FOR ALL
  USING (public.check_permission(auth.uid(), 'admin.manage_users'))
  WITH CHECK (public.check_permission(auth.uid(), 'admin.manage_users'));

-- user_permission_overrides
CREATE POLICY "Users can view own overrides"
  ON public.user_permission_overrides FOR SELECT
  USING (user_id = auth.uid() OR public.check_permission(auth.uid(), 'admin.manage_users'));

CREATE POLICY "Admins can manage overrides"
  ON public.user_permission_overrides FOR ALL
  USING (public.check_permission(auth.uid(), 'admin.manage_users'))
  WITH CHECK (public.check_permission(auth.uid(), 'admin.manage_users'));

-- job_participants
CREATE POLICY "Users can view own participations"
  ON public.job_participants FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins can manage participants"
  ON public.job_participants FOR ALL
  USING (public.check_permission(auth.uid(), 'jobs.assign_users'))
  WITH CHECK (public.check_permission(auth.uid(), 'jobs.assign_users'));
