
-- work_orders table
CREATE TABLE public.work_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  project_id uuid REFERENCES public.events(id),
  case_id uuid REFERENCES public.cases(id),
  title text NOT NULL DEFAULT '',
  description text,
  status text NOT NULL DEFAULT 'planned',
  technician_id uuid NOT NULL REFERENCES public.technicians(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add work_order_id to cases
ALTER TABLE public.cases ADD COLUMN work_order_id uuid REFERENCES public.work_orders(id);

-- Indexes
CREATE INDEX idx_work_orders_case ON public.work_orders(case_id);
CREATE INDEX idx_work_orders_project ON public.work_orders(project_id);
CREATE INDEX idx_work_orders_technician ON public.work_orders(technician_id);
CREATE INDEX idx_work_orders_starts ON public.work_orders(starts_at);

-- Enable RLS
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

-- RLS: Admin full access
CREATE POLICY "Admins can manage work_orders"
  ON public.work_orders FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- RLS: Company members can view
CREATE POLICY "Company members can view work_orders"
  ON public.work_orders FOR SELECT
  USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.user_memberships um
      WHERE um.user_id = auth.uid()
        AND um.company_id = work_orders.company_id
        AND um.is_active = true
    )
  );

-- RLS: Assigned technician can update
CREATE POLICY "Technician can update own work_orders"
  ON public.work_orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.technicians t
      WHERE t.id = work_orders.technician_id
        AND t.user_id = auth.uid()
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_orders;
