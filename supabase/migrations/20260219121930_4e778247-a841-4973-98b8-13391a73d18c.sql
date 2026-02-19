
-- Add Outlook sync columns to events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS outlook_sync_status text NOT NULL DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS outlook_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS outlook_deleted_at timestamptz;

-- Note: outlook_event_id (microsoft_event_id) already exists in events table
-- We'll use microsoft_event_id as the outlook_event_id equivalent

COMMENT ON COLUMN public.events.outlook_sync_status IS 'Outlook sync status: not_synced, synced, missing_in_outlook, failed, cancelled, restored';
COMMENT ON COLUMN public.events.outlook_last_synced_at IS 'Last time this event was synced to Outlook';
COMMENT ON COLUMN public.events.outlook_deleted_at IS 'When the Outlook event was deleted/cancelled';
