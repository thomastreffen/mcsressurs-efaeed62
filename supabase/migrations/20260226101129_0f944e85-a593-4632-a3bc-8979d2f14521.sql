
-- =====================================================
-- 1. Create customers table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  org_number text,
  main_email text,
  main_phone text,
  billing_address text,
  billing_zip text,
  billing_city text,
  notes text,
  company_id uuid REFERENCES public.internal_companies(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_org_number ON public.customers(org_number);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_company_id ON public.customers(company_id);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage customers"
  ON public.customers FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Users can view customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_memberships um
      WHERE um.user_id = auth.uid()
        AND um.company_id = customers.company_id
        AND um.is_active = true
    )
  );

-- =====================================================
-- 2. Create customer_contacts table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  role text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id ON public.customer_contacts(customer_id);

ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage customer_contacts"
  ON public.customer_contacts FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Users can view customer_contacts"
  ON public.customer_contacts FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM public.customers c
      JOIN public.user_memberships um ON um.company_id = c.company_id
      WHERE c.id = customer_contacts.customer_id
        AND um.user_id = auth.uid()
        AND um.is_active = true
    )
  );

-- =====================================================
-- 3. Add fields to events table for project enhancements
-- =====================================================
DO $$
BEGIN
  -- customer_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'customer_id') THEN
    ALTER TABLE public.events ADD COLUMN customer_id uuid REFERENCES public.customers(id);
  END IF;
  -- parent_project_id (self-reference for sub-projects)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'parent_project_id') THEN
    ALTER TABLE public.events ADD COLUMN parent_project_id uuid REFERENCES public.events(id);
  END IF;
  -- project_number
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'project_number') THEN
    ALTER TABLE public.events ADD COLUMN project_number text;
  END IF;
  -- project_type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'project_type') THEN
    ALTER TABLE public.events ADD COLUMN project_type text NOT NULL DEFAULT 'service';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_customer_id ON public.events(customer_id);
CREATE INDEX IF NOT EXISTS idx_events_parent_project_id ON public.events(parent_project_id);
CREATE INDEX IF NOT EXISTS idx_events_project_number ON public.events(project_number);

-- Updated_at trigger for customers
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
