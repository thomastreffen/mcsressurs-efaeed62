
-- Create service_jobs table (Servicearbeid)
CREATE TABLE public.service_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  project_id uuid REFERENCES public.events(id),
  case_id uuid REFERENCES public.cases(id),
  title text NOT NULL DEFAULT '',
  description text,
  address text,
  status text NOT NULL DEFAULT 'planned',
  technician_id uuid NOT NULL REFERENCES public.technicians(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add service_job_id to cases
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS service_job_id uuid REFERENCES public.service_jobs(id);

-- Indexes
CREATE INDEX idx_service_jobs_case ON public.service_jobs(case_id);
CREATE INDEX idx_service_jobs_project ON public.service_jobs(project_id);
CREATE INDEX idx_service_jobs_technician ON public.service_jobs(technician_id);
CREATE INDEX idx_service_jobs_starts ON public.service_jobs(starts_at);
CREATE INDEX idx_service_jobs_company ON public.service_jobs(company_id);

-- Enable RLS
ALTER TABLE public.service_jobs ENABLE ROW LEVEL SECURITY;

-- RLS: Admin full access
CREATE POLICY "Admins can manage service_jobs"
  ON public.service_jobs FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- RLS: Company members can view
CREATE POLICY "Company members can view service_jobs"
  ON public.service_jobs FOR SELECT
  USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.user_memberships um
      WHERE um.user_id = auth.uid()
        AND um.company_id = service_jobs.company_id
        AND um.is_active = true
    )
  );

-- RLS: Assigned technician can update
CREATE POLICY "Technician can update own service_jobs"
  ON public.service_jobs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.technicians t
      WHERE t.id = service_jobs.technician_id
        AND t.user_id = auth.uid()
    )
  );

-- updated_at trigger
CREATE TRIGGER update_service_jobs_updated_at
  BEFORE UPDATE ON public.service_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_jobs;
