
-- Job calendar links: per-technician Outlook event tracking
CREATE TABLE public.job_calendar_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'microsoft',
  calendar_event_id text,
  calendar_event_url text,
  last_synced_at timestamptz,
  sync_status text NOT NULL DEFAULT 'unlinked',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, technician_id)
);

ALTER TABLE public.job_calendar_links ENABLE ROW LEVEL SECURITY;

-- Technicians can see their own links
CREATE POLICY "Technicians can view own calendar links"
  ON public.job_calendar_links
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_admin()
  );

-- Admins can manage all calendar links
CREATE POLICY "Admins can manage calendar links"
  ON public.job_calendar_links
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_job_calendar_links_updated_at
  BEFORE UPDATE ON public.job_calendar_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_job_calendar_links_job_id ON public.job_calendar_links(job_id);
CREATE INDEX idx_job_calendar_links_user_id ON public.job_calendar_links(user_id);
