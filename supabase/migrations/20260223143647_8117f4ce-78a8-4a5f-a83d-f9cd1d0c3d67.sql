
-- Table: job_risk_items
CREATE TABLE public.job_risk_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'manual',  -- offer, contract, change_order, manual
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',       -- economic, legal, schedule, technical, documentation
  severity TEXT NOT NULL DEFAULT 'medium',       -- low, medium, high
  status TEXT NOT NULL DEFAULT 'open',           -- open, acknowledged, resolved, ignored
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(job_id, label)
);

-- Enable RLS
ALTER TABLE public.job_risk_items ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "risk_items_select" ON public.job_risk_items
  FOR SELECT USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM event_technicians et
      JOIN technicians t ON t.id = et.technician_id
      WHERE et.event_id = job_risk_items.job_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "risk_items_insert" ON public.job_risk_items
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "risk_items_update" ON public.job_risk_items
  FOR UPDATE USING (is_admin());

CREATE POLICY "risk_items_delete" ON public.job_risk_items
  FOR DELETE USING (is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_job_risk_items_updated_at
  BEFORE UPDATE ON public.job_risk_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
