
-- Add linked_risk_id to job_change_orders
ALTER TABLE public.job_change_orders
  ADD COLUMN IF NOT EXISTS linked_risk_id uuid REFERENCES public.job_risk_items(id) ON DELETE SET NULL;

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_job_change_orders_linked_risk ON public.job_change_orders(linked_risk_id) WHERE linked_risk_id IS NOT NULL;

-- Trigger: when change order status becomes 'approved', auto-resolve linked risk
CREATE OR REPLACE FUNCTION public.resolve_risk_on_co_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' AND NEW.linked_risk_id IS NOT NULL THEN
    UPDATE public.job_risk_items
    SET status = 'resolved', updated_at = now()
    WHERE id = NEW.linked_risk_id AND status IN ('open', 'acknowledged');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_resolve_risk_on_co_approval
  AFTER UPDATE ON public.job_change_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_risk_on_co_approval();
