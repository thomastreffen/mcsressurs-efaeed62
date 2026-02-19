
-- Company settings table (single-tenant, one row)
CREATE TABLE public.company_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text NOT NULL DEFAULT '',
  org_number text DEFAULT '',
  address text DEFAULT '',
  postal_code text DEFAULT '',
  city text DEFAULT '',
  country text DEFAULT 'Norge',
  phone text DEFAULT '',
  email text DEFAULT '',
  website text DEFAULT '',
  bank_account text DEFAULT '',
  iban text DEFAULT '',
  swift text DEFAULT '',
  logo_url text DEFAULT '',
  default_payment_terms text DEFAULT 'Netto 14 dager',
  default_offer_valid_days integer DEFAULT 30,
  default_offer_footer text DEFAULT '',
  default_offer_conditions text DEFAULT '',
  primary_color text DEFAULT '#2563eb',
  secondary_color text DEFAULT '#64748b',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "Authenticated users can view company settings"
  ON public.company_settings FOR SELECT
  USING (true);

-- Only super_admin can modify
CREATE POLICY "Super admins can manage company settings"
  ON public.company_settings FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Insert default row
INSERT INTO public.company_settings (company_name) VALUES ('MCS Service AS');

-- Trigger for updated_at
CREATE TRIGGER update_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add probability and expected_close_date to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS probability integer DEFAULT 50;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS expected_close_date date;

-- Storage bucket for company logos
INSERT INTO storage.buckets (id, name, public) VALUES ('company-assets', 'company-assets', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read company-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-assets');

CREATE POLICY "Super admins can upload company-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update company-assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete company-assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'super_admin'));
