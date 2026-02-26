
-- 1. Create mailboxes config table
CREATE TABLE public.mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text UNIQUE NOT NULL,
  display_name text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;

-- Admin can manage
CREATE POLICY "Admins can manage mailboxes"
  ON public.mailboxes FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- All authenticated can read
CREATE POLICY "Authenticated can view mailboxes"
  ON public.mailboxes FOR SELECT
  USING (true);

-- 2. Add columns to inbox_messages
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS mailbox_address text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS participant_user_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'team',
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

-- Index for mailbox filtering
CREATE INDEX IF NOT EXISTS idx_inbox_messages_mailbox_received
  ON public.inbox_messages (mailbox_address, received_at DESC);

-- 3. Insert default mailbox (disabled until admin enables)
INSERT INTO public.mailboxes (address, display_name, is_enabled)
VALUES ('postkontoret@mcsservice.no', 'Postkontoret', false)
ON CONFLICT (address) DO NOTHING;

-- 4. Update RLS on inbox_messages to support team/private visibility
DROP POLICY IF EXISTS "Users can view own inbox_messages" ON public.inbox_messages;

CREATE POLICY "Users can view inbox_messages"
  ON public.inbox_messages FOR SELECT
  USING (
    is_admin()
    OR visibility = 'team'
    OR owner_user_id = auth.uid()
    OR auth.uid() = ANY(participant_user_ids)
    OR fetched_by = auth.uid()
  );
