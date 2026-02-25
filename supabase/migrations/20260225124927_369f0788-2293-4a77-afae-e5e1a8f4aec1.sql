
-- Job tasks: sub-tasks within a project
CREATE TABLE public.job_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  assigned_technician_ids UUID[] DEFAULT '{}',
  scheduled_date DATE,
  start_time TIME,
  end_time TIME,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_job_tasks_job_id ON public.job_tasks(job_id);

-- RLS
ALTER TABLE public.job_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view job tasks"
  ON public.job_tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert job tasks"
  ON public.job_tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update job tasks"
  ON public.job_tasks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete job tasks"
  ON public.job_tasks FOR DELETE
  TO authenticated
  USING (true);

-- Updated_at trigger
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.job_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
