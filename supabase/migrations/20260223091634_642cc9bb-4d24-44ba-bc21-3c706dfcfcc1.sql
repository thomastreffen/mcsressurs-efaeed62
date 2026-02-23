
-- Create tenant_settings table for system-wide configuration
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tenant_settings"
  ON public.tenant_settings FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Authenticated can view tenant_settings"
  ON public.tenant_settings FOR SELECT
  USING (true);

-- Insert default settings
INSERT INTO public.tenant_settings (key, value) VALUES
  ('drift', '{"default_job_status": "requested", "auto_create_teams": false, "require_outlook_sync_before_planned": false, "default_work_hours_per_day": 8}'::jsonb),
  ('salg', '{"default_probability": 50, "auto_create_job_on_won": false, "default_offer_conditions": ""}'::jsonb),
  ('kontrakt', '{"default_lead_time_days": 30, "default_notify_days_before": [30,14,7,2,0], "risk_threshold_red": 70, "require_approval_before_signed": false}'::jsonb),
  ('fag', '{"require_approval_for_calc": false, "allow_revisions": true, "auto_pin_popular": false}'::jsonb),
  ('varsler', '{"email_on_critical_deadlines": true, "intercompany_notifications": true, "default_notify_days": [14,7,2]}'::jsonb)
ON CONFLICT (key) DO NOTHING;
