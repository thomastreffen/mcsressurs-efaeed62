
-- Enums for cases
CREATE TYPE public.case_status AS ENUM ('new', 'triage', 'assigned', 'waiting_customer', 'waiting_internal', 'converted', 'closed', 'archived');
CREATE TYPE public.case_priority AS ENUM ('low', 'normal', 'high', 'critical');
CREATE TYPE public.case_next_action AS ENUM ('call', 'quote', 'clarify', 'order', 'schedule', 'document', 'none');
CREATE TYPE public.case_scope AS ENUM ('company', 'department', 'project', 'private');

-- Cases table (Henvendelser)
CREATE TABLE public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  title text NOT NULL DEFAULT '',
  status public.case_status NOT NULL DEFAULT 'new',
  priority public.case_priority NOT NULL DEFAULT 'normal',
  due_at timestamptz,
  next_action public.case_next_action NOT NULL DEFAULT 'none',
  owner_user_id uuid,
  participant_user_ids uuid[] DEFAULT '{}',
  scope public.case_scope NOT NULL DEFAULT 'company',
  mailbox_address text,
  thread_id text,
  customer_id uuid REFERENCES public.customers(id),
  lead_id uuid REFERENCES public.leads(id),
  project_id uuid REFERENCES public.events(id),
  offer_id uuid REFERENCES public.offers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cases_company_status ON public.cases(company_id, status);
CREATE INDEX idx_cases_owner ON public.cases(owner_user_id);
CREATE INDEX idx_cases_thread ON public.cases(thread_id);

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage cases" ON public.cases
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Team read: scope=company → all in tenant
CREATE POLICY "Team can view company-scoped cases" ON public.cases
  FOR SELECT USING (
    scope = 'company'
    AND EXISTS (
      SELECT 1 FROM public.user_memberships um
      WHERE um.user_id = auth.uid() AND um.company_id = cases.company_id AND um.is_active = true
    )
  );

-- Private: owner + participants
CREATE POLICY "Private case access" ON public.cases
  FOR SELECT USING (
    scope = 'private'
    AND (owner_user_id = auth.uid() OR auth.uid() = ANY(participant_user_ids))
  );

-- Owner can update own cases
CREATE POLICY "Owner can update cases" ON public.cases
  FOR UPDATE USING (
    owner_user_id = auth.uid() OR auth.uid() = ANY(participant_user_ids)
  );

-- Case items (tidslinje)
CREATE TABLE public.case_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'note',
  external_id text,
  subject text,
  from_email text,
  to_emails text[],
  body_preview text,
  body_html text,
  received_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_case_items_case ON public.case_items(case_id, created_at DESC);
CREATE UNIQUE INDEX idx_case_items_external ON public.case_items(external_id) WHERE external_id IS NOT NULL;

ALTER TABLE public.case_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage case_items" ON public.case_items
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Users can view case_items via case" ON public.case_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id = case_items.case_id
        AND (
          is_admin()
          OR (c.scope = 'company' AND EXISTS (
            SELECT 1 FROM public.user_memberships um
            WHERE um.user_id = auth.uid() AND um.company_id = c.company_id AND um.is_active = true
          ))
          OR c.owner_user_id = auth.uid()
          OR auth.uid() = ANY(c.participant_user_ids)
        )
    )
  );

-- Users can insert items into cases they participate in
CREATE POLICY "Participants can insert case_items" ON public.case_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id = case_items.case_id
        AND (is_admin() OR c.owner_user_id = auth.uid() OR auth.uid() = ANY(c.participant_user_ids))
    )
  );

-- Routing rules
CREATE TABLE public.case_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  mailbox_address text,
  from_contains text,
  subject_contains text,
  body_contains text,
  ai_category_in text[],
  priority_set public.case_priority,
  status_set public.case_status,
  next_action_set public.case_next_action,
  owner_user_id_set uuid,
  scope_set public.case_scope,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.case_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage routing rules" ON public.case_routing_rules
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Auth users can view routing rules" ON public.case_routing_rules
  FOR SELECT USING (true);

-- Add graph_delta_link to mailboxes for delta sync
ALTER TABLE public.mailboxes ADD COLUMN IF NOT EXISTS graph_delta_link text;

-- Updated_at trigger for cases
CREATE TRIGGER update_cases_updated_at BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
