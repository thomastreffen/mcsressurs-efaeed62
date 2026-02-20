
-- Add idempotency and dirty-state columns to job_calendar_links
ALTER TABLE public.job_calendar_links
  ADD COLUMN IF NOT EXISTS last_sync_hash text,
  ADD COLUMN IF NOT EXISTS last_operation_id uuid,
  ADD COLUMN IF NOT EXISTS last_operation_at timestamptz;

-- Add calendar dirty state to events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS calendar_dirty boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS calendar_last_synced_at timestamptz;

-- Create job_calendar_audit table
CREATE TABLE public.job_calendar_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  performed_by uuid NOT NULL,
  operation_id uuid NOT NULL,
  action text NOT NULL,
  technicians_count int NOT NULL DEFAULT 0,
  successes_count int NOT NULL DEFAULT 0,
  failures_count int NOT NULL DEFAULT 0,
  override_conflicts boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.job_calendar_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies for audit table
CREATE POLICY "Admins can manage calendar audit"
  ON public.job_calendar_audit FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Technicians can view own job audit"
  ON public.job_calendar_audit FOR SELECT
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM event_technicians et
      JOIN technicians t ON t.id = et.technician_id
      WHERE et.event_id = job_calendar_audit.job_id AND t.user_id = auth.uid()
    )
  );

-- Trigger to set calendar_dirty when job fields change
CREATE OR REPLACE FUNCTION public.set_calendar_dirty()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    OLD.start_time IS DISTINCT FROM NEW.start_time OR
    OLD.end_time IS DISTINCT FROM NEW.end_time OR
    OLD.address IS DISTINCT FROM NEW.address OR
    OLD.title IS DISTINCT FROM NEW.title OR
    OLD.description IS DISTINCT FROM NEW.description
  ) THEN
    -- Only set dirty if there are linked calendar entries
    IF EXISTS (
      SELECT 1 FROM public.job_calendar_links
      WHERE job_id = NEW.id AND sync_status = 'linked'
    ) THEN
      NEW.calendar_dirty = true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_set_calendar_dirty
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_calendar_dirty();
