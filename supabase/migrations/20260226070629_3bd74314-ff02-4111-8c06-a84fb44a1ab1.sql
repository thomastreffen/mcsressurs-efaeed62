
-- Add task_id FK to events table to link calendar events to project tasks
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES public.job_tasks(id) ON DELETE SET NULL;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_events_task_id ON public.events(task_id) WHERE task_id IS NOT NULL;
