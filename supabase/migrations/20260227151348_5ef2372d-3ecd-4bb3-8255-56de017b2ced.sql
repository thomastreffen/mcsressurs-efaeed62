
-- Tighten notifications insert policy: only admin or the user themselves
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "Insert notifications" ON public.notifications FOR INSERT
  WITH CHECK (is_admin() OR user_id = auth.uid());
