
-- ============================================
-- CONTRACTS MODULE - PHASE 1
-- ============================================

-- 1. contracts
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  department_id uuid REFERENCES public.departments(id),
  title text NOT NULL,
  counterparty_name text,
  executing_company_ids uuid[] DEFAULT '{}',
  lead_id uuid REFERENCES public.leads(id),
  job_id uuid REFERENCES public.events(id),
  status text NOT NULL DEFAULT 'draft',
  contract_type text,
  signed_date date,
  start_date date,
  end_date date,
  penalty_type text,
  penalty_rate numeric,
  penalty_unit text,
  warranty_months int,
  ai_summary_pl text,
  ai_summary_econ text,
  ai_summary_field text,
  risk_score int DEFAULT 0,
  risk_level text DEFAULT 'green',
  ai_confidence int DEFAULT 0,
  last_analyzed_at timestamptz,
  last_analyzed_by uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contracts select" ON public.contracts
  FOR SELECT USING (
    check_permission(auth.uid(), 'contracts.read')
    AND can_access_record(auth.uid(), company_id, department_id, created_by, id)
  );

CREATE POLICY "Contracts insert" ON public.contracts
  FOR INSERT WITH CHECK (
    check_permission(auth.uid(), 'contracts.edit')
  );

CREATE POLICY "Contracts update" ON public.contracts
  FOR UPDATE USING (
    check_permission(auth.uid(), 'contracts.edit')
    AND can_access_record(auth.uid(), company_id, department_id, created_by, id)
  );

CREATE POLICY "Contracts delete" ON public.contracts
  FOR DELETE USING (
    check_permission(auth.uid(), 'contracts.admin')
  );

CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. contract_documents
CREATE TABLE public.contract_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text NOT NULL,
  version int DEFAULT 1,
  is_primary boolean DEFAULT true,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contract docs select" ON public.contract_documents
  FOR SELECT USING (
    check_permission(auth.uid(), 'contracts.read')
    AND EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_documents.contract_id
      AND can_access_record(auth.uid(), c.company_id, c.department_id, c.created_by, c.id)
    )
  );

CREATE POLICY "Contract docs insert" ON public.contract_documents
  FOR INSERT WITH CHECK (
    check_permission(auth.uid(), 'contracts.edit')
  );

CREATE POLICY "Contract docs update" ON public.contract_documents
  FOR UPDATE USING (
    check_permission(auth.uid(), 'contracts.edit')
  );

CREATE POLICY "Contract docs delete" ON public.contract_documents
  FOR DELETE USING (
    check_permission(auth.uid(), 'contracts.admin')
  );

-- 3. contract_deadlines
CREATE TABLE public.contract_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.events(id),
  type text NOT NULL,
  title text NOT NULL,
  due_date date NOT NULL,
  notify_days_before int[] DEFAULT '{30,14,7,2,0}',
  severity text DEFAULT 'warn',
  status text DEFAULT 'open',
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_deadlines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contract deadlines select" ON public.contract_deadlines
  FOR SELECT USING (
    check_permission(auth.uid(), 'contracts.read')
  );

CREATE POLICY "Contract deadlines insert" ON public.contract_deadlines
  FOR INSERT WITH CHECK (
    check_permission(auth.uid(), 'contracts.edit')
  );

CREATE POLICY "Contract deadlines update" ON public.contract_deadlines
  FOR UPDATE USING (
    check_permission(auth.uid(), 'contracts.edit')
  );

CREATE POLICY "Contract deadlines delete" ON public.contract_deadlines
  FOR DELETE USING (
    check_permission(auth.uid(), 'contracts.admin')
  );

-- 4. contract_alerts
CREATE TABLE public.contract_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.events(id),
  alert_type text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  due_date date,
  is_read boolean DEFAULT false,
  target_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contract alerts select" ON public.contract_alerts
  FOR SELECT USING (
    check_permission(auth.uid(), 'contracts.read')
  );

CREATE POLICY "Contract alerts insert" ON public.contract_alerts
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Contract alerts update" ON public.contract_alerts
  FOR UPDATE USING (
    target_user_id = auth.uid() OR is_admin()
  );

CREATE POLICY "Contract alerts delete" ON public.contract_alerts
  FOR DELETE USING (is_admin());

-- 5. Job snapshot fields
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS contract_risk_level text DEFAULT 'green',
  ADD COLUMN IF NOT EXISTS next_contract_deadline date,
  ADD COLUMN IF NOT EXISTS contract_alert_count int DEFAULT 0;

-- 6. Indexes
CREATE INDEX idx_contracts_company ON public.contracts(company_id);
CREATE INDEX idx_contracts_job ON public.contracts(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_contracts_lead ON public.contracts(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_contracts_status ON public.contracts(status);
CREATE INDEX idx_contract_deadlines_due ON public.contract_deadlines(due_date) WHERE status = 'open';
CREATE INDEX idx_contract_alerts_unread ON public.contract_alerts(is_read) WHERE is_read = false;

-- 7. Storage bucket for contract documents
INSERT INTO storage.buckets (id, name, public) VALUES ('contract-documents', 'contract-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Contract docs storage select" ON storage.objects
  FOR SELECT USING (bucket_id = 'contract-documents' AND auth.role() = 'authenticated');

CREATE POLICY "Contract docs storage insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'contract-documents' AND auth.role() = 'authenticated');

CREATE POLICY "Contract docs storage update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'contract-documents' AND auth.role() = 'authenticated');

CREATE POLICY "Contract docs storage delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'contract-documents' AND auth.role() = 'authenticated');
