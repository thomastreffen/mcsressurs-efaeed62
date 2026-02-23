
-- Create job_summaries table for persistent job summaries
CREATE TABLE public.job_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  summary_text TEXT,
  key_numbers JSONB DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual',
  is_locked BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT job_summaries_job_id_unique UNIQUE (job_id)
);

-- Enable RLS
ALTER TABLE public.job_summaries ENABLE ROW LEVEL SECURITY;

-- Policies matching events access pattern
CREATE POLICY "job_summaries_select"
ON public.job_summaries FOR SELECT
USING (
  is_admin() OR (
    EXISTS (
      SELECT 1 FROM event_technicians et
      JOIN technicians t ON t.id = et.technician_id
      WHERE et.event_id = job_summaries.job_id AND t.user_id = auth.uid()
    )
  )
);

CREATE POLICY "job_summaries_insert"
ON public.job_summaries FOR INSERT
WITH CHECK (is_admin());

CREATE POLICY "job_summaries_update"
ON public.job_summaries FOR UPDATE
USING (is_admin());

CREATE POLICY "job_summaries_delete"
ON public.job_summaries FOR DELETE
USING (is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_job_summaries_updated_at
BEFORE UPDATE ON public.job_summaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
