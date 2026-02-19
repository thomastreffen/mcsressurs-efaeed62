
-- Create lead status enum
CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'qualified', 'lost', 'won');

-- Create leads table
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  source TEXT,
  status lead_status NOT NULL DEFAULT 'new',
  estimated_value NUMERIC DEFAULT 0,
  notes TEXT,
  owner_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage leads" ON public.leads FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Add lead_id to calculations
ALTER TABLE public.calculations ADD COLUMN lead_id UUID REFERENCES public.leads(id);

-- Add lead_id to offers
ALTER TABLE public.offers ADD COLUMN lead_id UUID REFERENCES public.leads(id);

-- Add valid_until, accepted_at, accepted_ip, public_token to offers
ALTER TABLE public.offers ADD COLUMN valid_until DATE;
ALTER TABLE public.offers ADD COLUMN accepted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.offers ADD COLUMN accepted_ip TEXT;
ALTER TABLE public.offers ADD COLUMN public_token UUID DEFAULT gen_random_uuid() UNIQUE;

-- Activity log for full traceability
CREATE TABLE public.activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL, -- 'lead', 'calculation', 'offer', 'event'
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  performed_by UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage activity_log" ON public.activity_log FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Index for fast lookups
CREATE INDEX idx_activity_log_entity ON public.activity_log(entity_type, entity_id);
CREATE INDEX idx_leads_status ON public.leads(status);

-- Trigger for leads updated_at
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
