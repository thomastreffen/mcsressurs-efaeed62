
-- ============================================================
-- 1. job_change_orders – change order / tillegg per jobb
-- ============================================================
CREATE TABLE public.job_change_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text NOT NULL,
  reason_type   text NOT NULL DEFAULT 'other',
  amount_ex_vat numeric NOT NULL DEFAULT 0,
  currency      text NOT NULL DEFAULT 'NOK',
  vat_rate      numeric NOT NULL DEFAULT 25,
  amount_inc_vat numeric GENERATED ALWAYS AS (amount_ex_vat * (1 + vat_rate / 100)) STORED,
  cost_material   numeric,
  cost_labor_hours numeric,
  cost_labor_rate  numeric NOT NULL DEFAULT 1080,
  cost_total       numeric GENERATED ALWAYS AS (COALESCE(cost_material, 0) + COALESCE(cost_labor_hours, 0) * cost_labor_rate) STORED,
  margin_amount    numeric GENERATED ALWAYS AS (amount_ex_vat - (COALESCE(cost_material, 0) + COALESCE(cost_labor_hours, 0) * cost_labor_rate)) STORED,
  schedule_impact  text,
  status        text NOT NULL DEFAULT 'draft',
  customer_name   text,
  customer_email  text,
  sent_at         timestamptz,
  responded_at    timestamptz,
  response_message text,
  approved_by_name  text,
  approved_by_email text,
  approval_method   text,
  approval_token_hash text,
  approval_expires_at timestamptz,
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER update_change_orders_updated_at
  BEFORE UPDATE ON public.job_change_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_change_orders_job_id ON public.job_change_orders(job_id);
CREATE INDEX idx_change_orders_status ON public.job_change_orders(status);

-- RLS
ALTER TABLE public.job_change_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "change_orders_select"
  ON public.job_change_orders FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM event_technicians et
      JOIN technicians t ON t.id = et.technician_id
      WHERE et.event_id = job_change_orders.job_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "change_orders_insert"
  ON public.job_change_orders FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "change_orders_update"
  ON public.job_change_orders FOR UPDATE
  USING (is_admin());

CREATE POLICY "change_orders_delete"
  ON public.job_change_orders FOR DELETE
  USING (is_admin());


-- ============================================================
-- 2. job_change_order_events – audit log for change orders
-- ============================================================
CREATE TABLE public.job_change_order_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id  uuid NOT NULL REFERENCES public.job_change_orders(id) ON DELETE CASCADE,
  job_id           uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_type       text NOT NULL,
  event_message    text,
  actor_type       text NOT NULL DEFAULT 'user',
  actor_name       text,
  actor_email      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_co_events_co_id ON public.job_change_order_events(change_order_id);
CREATE INDEX idx_co_events_job_id ON public.job_change_order_events(job_id);

ALTER TABLE public.job_change_order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "co_events_select"
  ON public.job_change_order_events FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM event_technicians et
      JOIN technicians t ON t.id = et.technician_id
      WHERE et.event_id = job_change_order_events.job_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "co_events_insert"
  ON public.job_change_order_events FOR INSERT
  WITH CHECK (is_admin());
