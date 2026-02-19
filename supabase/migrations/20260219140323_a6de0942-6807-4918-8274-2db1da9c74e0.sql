
-- Sequence for global offer numbers
CREATE SEQUENCE public.offer_number_seq START 1;

-- Create offer status enum
CREATE TYPE public.offer_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired');

-- Create offers table
CREATE TABLE public.offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  calculation_id UUID NOT NULL REFERENCES public.calculations(id) ON DELETE CASCADE,
  offer_number TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  status public.offer_status NOT NULL DEFAULT 'draft',
  total_ex_vat NUMERIC NOT NULL DEFAULT 0,
  total_inc_vat NUMERIC NOT NULL DEFAULT 0,
  generated_pdf_url TEXT,
  generated_html_snapshot TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  sent_to_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Auto-generate offer_number
CREATE OR REPLACE FUNCTION public.generate_offer_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.offer_number IS NULL OR NEW.offer_number = '' THEN
    NEW.offer_number := 'MCS-' || EXTRACT(YEAR FROM now())::text || '-' || LPAD(nextval('public.offer_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_offer_number
  BEFORE INSERT ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_offer_number();

-- Enable RLS
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage offers"
  ON public.offers FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Add offer_id to events for linking
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES public.offers(id);
