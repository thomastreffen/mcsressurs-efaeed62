
-- Superoffice settings table
CREATE TABLE public.superoffice_settings (
  company_id uuid PRIMARY KEY REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  default_mailbox_address text,
  catchall_mailbox_address text,
  catchall_enabled boolean NOT NULL DEFAULT false,
  default_case_scope text NOT NULL DEFAULT 'company',
  default_case_status text NOT NULL DEFAULT 'new',
  default_priority text NOT NULL DEFAULT 'normal',
  auto_triage_enabled boolean NOT NULL DEFAULT false,
  auto_assign_enabled boolean NOT NULL DEFAULT false,
  auto_assign_sales_user_id uuid,
  auto_assign_service_user_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.superoffice_settings ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins manage superoffice_settings"
  ON public.superoffice_settings FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Authenticated read
CREATE POLICY "Auth users view superoffice_settings"
  ON public.superoffice_settings FOR SELECT
  USING (true);

-- Add sync error tracking to mailboxes
ALTER TABLE public.mailboxes
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_error text,
  ADD COLUMN IF NOT EXISTS last_sync_count integer DEFAULT 0;
