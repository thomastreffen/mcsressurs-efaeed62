
-- Fix: remove the overly permissive INSERT policy
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- Allow service_role inserts (edge functions) by keeping only admin policy
-- Edge functions use service_role which bypasses RLS
