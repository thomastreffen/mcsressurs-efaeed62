
-- Calculation status enum
CREATE TYPE public.calculation_status AS ENUM ('draft', 'generated', 'sent', 'accepted', 'rejected', 'converted');

-- Calculation item type enum
CREATE TYPE public.calculation_item_type AS ENUM ('material', 'labor');

-- System settings table
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view settings" ON public.settings FOR SELECT USING (is_admin());
CREATE POLICY "Super admins can manage settings" ON public.settings FOR ALL USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Seed default settings
INSERT INTO public.settings (key, value) VALUES
  ('material_multiplier', '2.0'),
  ('default_hour_rate', '1080'),
  ('default_margin_percent', '15');

-- Calculations table
CREATE TABLE public.calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  customer_email text,
  project_title text NOT NULL,
  description text,
  ai_analysis jsonb,
  total_material numeric DEFAULT 0,
  total_labor numeric DEFAULT 0,
  total_price numeric DEFAULT 0,
  status calculation_status NOT NULL DEFAULT 'draft',
  attachments jsonb DEFAULT '[]',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calculations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage calculations" ON public.calculations FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE TRIGGER update_calculations_updated_at
  BEFORE UPDATE ON public.calculations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Calculation items table
CREATE TABLE public.calculation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id uuid NOT NULL REFERENCES public.calculations(id) ON DELETE CASCADE,
  type calculation_item_type NOT NULL,
  title text NOT NULL,
  description text,
  quantity numeric NOT NULL DEFAULT 1,
  unit text DEFAULT 'stk',
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  suggested_by_ai boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calculation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage calculation_items" ON public.calculation_items FOR ALL USING (is_admin()) WITH CHECK (is_admin());
