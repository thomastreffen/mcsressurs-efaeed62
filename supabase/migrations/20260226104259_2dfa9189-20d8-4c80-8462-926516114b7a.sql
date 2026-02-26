
-- Form templates
CREATE TABLE public.form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text DEFAULT 'general',
  active_version_id uuid,
  company_id uuid REFERENCES public.internal_companies(id),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Form template versions
CREATE TABLE public.form_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  fields jsonb NOT NULL DEFAULT '[]',
  rules jsonb NOT NULL DEFAULT '[]',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, version_number)
);

-- Add FK for active_version_id after version table exists
ALTER TABLE public.form_templates
  ADD CONSTRAINT form_templates_active_version_fkey
  FOREIGN KEY (active_version_id) REFERENCES public.form_template_versions(id);

-- Form instances (filled forms)
CREATE TABLE public.form_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.form_templates(id),
  version_id uuid NOT NULL REFERENCES public.form_template_versions(id),
  project_id uuid REFERENCES public.events(id),
  activity_id uuid REFERENCES public.job_tasks(id),
  status text NOT NULL DEFAULT 'not_started',
  assigned_to uuid,
  answers jsonb NOT NULL DEFAULT '{}',
  locked_at timestamptz,
  locked_by uuid,
  unlock_reason text,
  company_id uuid REFERENCES public.internal_companies(id),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Form signatures
CREATE TABLE public.form_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.form_instances(id) ON DELETE CASCADE,
  signer_name text NOT NULL,
  signer_role text,
  signature_data text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text
);

-- Form PDF imports
CREATE TABLE public.form_pdf_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id uuid REFERENCES public.documents(id),
  parsed_json jsonb NOT NULL DEFAULT '{}',
  confidence numeric,
  template_id uuid REFERENCES public.form_templates(id),
  status text NOT NULL DEFAULT 'pending',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_pdf_imports ENABLE ROW LEVEL SECURITY;

-- Templates: admins manage, authenticated read
CREATE POLICY "Admins manage form_templates" ON public.form_templates FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Auth users view form_templates" ON public.form_templates FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

-- Versions: admins manage, authenticated read
CREATE POLICY "Admins manage form_template_versions" ON public.form_template_versions FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Auth users view form_template_versions" ON public.form_template_versions FOR SELECT TO authenticated
  USING (true);

-- Instances: admins full, assigned users can view/update
CREATE POLICY "Admins manage form_instances" ON public.form_instances FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Assigned users view form_instances" ON public.form_instances FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid());
CREATE POLICY "Assigned users update form_instances" ON public.form_instances FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() AND locked_at IS NULL);

-- Signatures: admins manage, users can insert on their instances
CREATE POLICY "Admins manage form_signatures" ON public.form_signatures FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Users view form_signatures" ON public.form_signatures FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Users insert form_signatures" ON public.form_signatures FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = instance_id AND (fi.assigned_to = auth.uid() OR fi.created_by = auth.uid())
  ));

-- PDF imports: admins only
CREATE POLICY "Admins manage form_pdf_imports" ON public.form_pdf_imports FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- Updated_at triggers
CREATE TRIGGER form_templates_updated_at BEFORE UPDATE ON public.form_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER form_instances_updated_at BEFORE UPDATE ON public.form_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
