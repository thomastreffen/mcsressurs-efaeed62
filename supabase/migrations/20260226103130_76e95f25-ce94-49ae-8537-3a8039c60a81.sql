
-- Create inbox_messages table
CREATE TABLE public.inbox_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id text NOT NULL,
  subject text NOT NULL DEFAULT '',
  from_name text,
  from_email text,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  body_preview text,
  body_full text,
  has_attachments boolean NOT NULL DEFAULT false,
  ai_category text,
  ai_confidence numeric,
  status text NOT NULL DEFAULT 'new',
  linked_project_id uuid REFERENCES public.events(id),
  linked_lead_id uuid REFERENCES public.leads(id),
  assigned_user_id uuid,
  company_id uuid REFERENCES public.internal_companies(id),
  fetched_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique on external_id to prevent duplicates
CREATE UNIQUE INDEX idx_inbox_messages_external_id ON public.inbox_messages(external_id);

-- Index for status filtering
CREATE INDEX idx_inbox_messages_status ON public.inbox_messages(status);
CREATE INDEX idx_inbox_messages_received_at ON public.inbox_messages(received_at DESC);

-- Enable RLS
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage inbox_messages"
  ON public.inbox_messages FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Users can view messages assigned to them or fetched by them
CREATE POLICY "Users can view own inbox_messages"
  ON public.inbox_messages FOR SELECT
  USING (
    is_admin()
    OR assigned_user_id = auth.uid()
    OR fetched_by = auth.uid()
  );
