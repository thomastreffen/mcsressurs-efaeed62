
-- ==========================================
-- 1) documents table – unified file registry
-- ==========================================
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,            -- 'job', 'lead', 'calculation', etc.
  entity_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'other', -- 'offer','contract','drawing','fdv','image','other'
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  file_size bigint,
  storage_bucket text NOT NULL DEFAULT 'job-attachments',
  public_url text,
  uploaded_by uuid,
  company_id uuid REFERENCES public.internal_companies(id),
  department_id uuid REFERENCES public.departments(id),
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_entity ON public.documents(entity_type, entity_id);
CREATE INDEX idx_documents_category ON public.documents(category);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Documents select" ON public.documents
  FOR SELECT USING (
    is_admin()
    OR (entity_type = 'job' AND EXISTS (
      SELECT 1 FROM events e WHERE e.id = documents.entity_id AND (
        is_admin() OR e.id IN (
          SELECT et.event_id FROM event_technicians et
          JOIN technicians t ON t.id = et.technician_id
          WHERE t.user_id = auth.uid()
        )
      )
    ))
  );

CREATE POLICY "Documents insert" ON public.documents
  FOR INSERT WITH CHECK (is_admin() OR check_permission(auth.uid(), 'jobs.edit'::text));

CREATE POLICY "Documents update" ON public.documents
  FOR UPDATE USING (is_admin() OR uploaded_by = auth.uid());

CREATE POLICY "Documents delete" ON public.documents
  FOR DELETE USING (is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- 2) document_analyses table – AI results
-- ==========================================
CREATE TABLE public.document_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.events(id),
  analysis_type text NOT NULL,  -- 'offer', 'contract'
  raw_output jsonb,
  parsed_fields jsonb NOT NULL DEFAULT '{}',
  confidence integer,
  version integer NOT NULL DEFAULT 1,
  analyzed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_analyses_document ON public.document_analyses(document_id);
CREATE INDEX idx_doc_analyses_job ON public.document_analyses(job_id);

ALTER TABLE public.document_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doc analyses select" ON public.document_analyses
  FOR SELECT USING (
    is_admin()
    OR (job_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM events e WHERE e.id = document_analyses.job_id AND (
        is_admin() OR e.id IN (
          SELECT et.event_id FROM event_technicians et
          JOIN technicians t ON t.id = et.technician_id
          WHERE t.user_id = auth.uid()
        )
      )
    ))
  );

CREATE POLICY "Doc analyses insert" ON public.document_analyses
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Doc analyses delete" ON public.document_analyses
  FOR DELETE USING (is_admin());
