
-- 1. Sequence for lead ref codes
CREATE SEQUENCE IF NOT EXISTS public.lead_ref_code_seq START 1;

-- 2. Add lead_ref_code column
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_ref_code text UNIQUE;

-- 3. Trigger to auto-generate lead_ref_code on insert
CREATE OR REPLACE FUNCTION public.generate_lead_ref_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.lead_ref_code IS NULL OR NEW.lead_ref_code = '' THEN
    NEW.lead_ref_code := 'LEAD-' || EXTRACT(YEAR FROM now())::text || '-' || LPAD(nextval('public.lead_ref_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_generate_lead_ref_code
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.generate_lead_ref_code();

-- 4. Backfill existing leads that have no ref code
UPDATE public.leads
SET lead_ref_code = 'LEAD-' || EXTRACT(YEAR FROM created_at)::text || '-' || LPAD(nextval('public.lead_ref_code_seq')::text, 6, '0')
WHERE lead_ref_code IS NULL;

-- 5. Create lead_calendar_links table
CREATE TABLE public.lead_calendar_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  outlook_event_id text NOT NULL,
  event_subject text,
  event_start timestamp with time zone,
  event_end timestamp with time zone,
  event_location text,
  attendee_emails text[],
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_synced_at timestamp with time zone
);

-- 6. Enable RLS on lead_calendar_links
ALTER TABLE public.lead_calendar_links ENABLE ROW LEVEL SECURITY;

-- RLS: Admins can manage
CREATE POLICY "Admins can manage lead_calendar_links"
ON public.lead_calendar_links
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- RLS: Lead participants can view
CREATE POLICY "Lead participants can view lead_calendar_links"
ON public.lead_calendar_links
FOR SELECT
USING (
  is_admin() OR EXISTS (
    SELECT 1 FROM public.lead_participants lp
    WHERE lp.lead_id = lead_calendar_links.lead_id AND lp.user_id = auth.uid()
  )
);

-- 7. Add new permission keys
INSERT INTO public.role_permissions (role_id, permission_key, allowed)
SELECT r.id, perm.key, true
FROM public.roles r
CROSS JOIN (VALUES ('leads.email_draft'), ('leads.create_meeting')) AS perm(key)
WHERE r.name IN ('Administrator', 'Super Admin')
ON CONFLICT DO NOTHING;
