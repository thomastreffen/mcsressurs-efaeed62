
-- 2. Add audit fields to events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS editing_by uuid,
  ADD COLUMN IF NOT EXISTS editing_started_at timestamptz;

-- 3. Create event_logs table
CREATE TABLE public.event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('created', 'updated', 'cancelled', 'attendee_added', 'attendee_removed')),
  performed_by uuid,
  timestamp timestamptz NOT NULL DEFAULT now(),
  change_summary text
);

ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

-- Admins and super_admins can view/insert event logs
CREATE POLICY "Admins can view event_logs"
  ON public.event_logs FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can insert event_logs"
  ON public.event_logs FOR INSERT
  WITH CHECK (is_admin());

-- 4. Update is_admin function to include super_admin
CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
$$;

-- 5. Super_admin can manage user_roles
CREATE POLICY "Super_admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
