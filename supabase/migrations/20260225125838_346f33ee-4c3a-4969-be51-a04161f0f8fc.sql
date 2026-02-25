
CREATE TABLE public.job_task_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.job_tasks(id) ON DELETE CASCADE,
  created_by UUID,
  note_text TEXT,
  file_name TEXT,
  file_path TEXT,
  file_mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.job_task_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view task notes"
  ON public.job_task_notes FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert task notes"
  ON public.job_task_notes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete task notes"
  ON public.job_task_notes FOR DELETE
  USING (true);
