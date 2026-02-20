
-- Communication logs table for email tracking linked to leads/jobs
CREATE TABLE public.communication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('lead', 'job')),
  entity_id uuid NOT NULL,
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  mode text NOT NULL DEFAULT 'draft' CHECK (mode IN ('draft', 'sent')),
  to_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_recipients jsonb DEFAULT '[]'::jsonb,
  bcc_recipients jsonb DEFAULT '[]'::jsonb,
  subject text NOT NULL DEFAULT '',
  body_preview text,
  graph_message_id text,
  internet_message_id text,
  conversation_id text,
  outlook_weblink text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_logs ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins can manage communication_logs"
  ON public.communication_logs FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Users can view logs for entities they participate in
CREATE POLICY "Users can view own communication_logs"
  ON public.communication_logs FOR SELECT
  USING (
    is_admin()
    OR created_by = auth.uid()
    OR (entity_type = 'lead' AND EXISTS (
      SELECT 1 FROM lead_participants lp WHERE lp.lead_id = communication_logs.entity_id AND lp.user_id = auth.uid()
    ))
    OR (entity_type = 'job' AND EXISTS (
      SELECT 1 FROM job_participants jp WHERE jp.job_id = communication_logs.entity_id AND jp.user_id = auth.uid()
    ))
  );

-- Trigger for updated_at
CREATE TRIGGER update_communication_logs_updated_at
  BEFORE UPDATE ON public.communication_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
