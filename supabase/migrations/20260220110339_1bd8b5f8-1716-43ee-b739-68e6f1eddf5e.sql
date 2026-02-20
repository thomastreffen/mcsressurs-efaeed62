
-- Extend activity_log with new columns for unified activity engine
ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'note',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS microsoft_event_id text,
  ADD COLUMN IF NOT EXISTS microsoft_message_id text,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal';

-- Add index for faster entity lookups
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON public.activity_log (entity_type, entity_id, created_at DESC);

-- Add index for type filtering
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON public.activity_log (type);

-- Migrate existing lead_history into activity_log (backward compat: keep lead_history intact)
INSERT INTO public.activity_log (entity_type, entity_id, action, description, performed_by, created_at, type, title, metadata, visibility)
SELECT
  'lead',
  lh.lead_id,
  lh.action,
  lh.description,
  lh.performed_by,
  lh.created_at,
  CASE
    WHEN lh.action = 'status_changed' THEN 'status_change'
    WHEN lh.action = 'owner_changed' THEN 'status_change'
    WHEN lh.action IN ('participant_added', 'participant_removed') THEN 'note'
    WHEN lh.action = 'converted_to_project' THEN 'status_change'
    ELSE 'note'
  END,
  COALESCE(lh.description, lh.action),
  COALESCE(lh.metadata, '{}'::jsonb),
  'internal'
FROM public.lead_history lh
WHERE NOT EXISTS (
  SELECT 1 FROM public.activity_log al
  WHERE al.entity_type = 'lead'
    AND al.entity_id = lh.lead_id
    AND al.created_at = lh.created_at
    AND al.action = lh.action
);

-- Migrate calendar links into activity_log as meeting type entries
INSERT INTO public.activity_log (entity_type, entity_id, action, description, performed_by, created_at, type, title, microsoft_event_id, metadata, visibility)
SELECT
  'lead',
  lcl.lead_id,
  'meeting_created',
  COALESCE(lcl.event_subject, 'Outlook-møte'),
  lcl.created_by,
  lcl.created_at,
  'meeting',
  COALESCE(lcl.event_subject, 'Møte'),
  lcl.outlook_event_id,
  jsonb_build_object(
    'event_start', lcl.event_start,
    'event_end', lcl.event_end,
    'event_location', lcl.event_location,
    'attendee_emails', lcl.attendee_emails
  ),
  'internal'
FROM public.lead_calendar_links lcl
WHERE NOT EXISTS (
  SELECT 1 FROM public.activity_log al
  WHERE al.microsoft_event_id = lcl.outlook_event_id
    AND al.entity_type = 'lead'
);

-- Add RLS policy for lead participants to view activity_log entries for their leads
CREATE POLICY "Lead participants can view activity_log"
ON public.activity_log
FOR SELECT
USING (
  is_admin()
  OR (
    entity_type = 'lead' AND EXISTS (
      SELECT 1 FROM public.lead_participants lp
      WHERE lp.lead_id = activity_log.entity_id AND lp.user_id = auth.uid()
    )
  )
);
