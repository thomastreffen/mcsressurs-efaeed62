
-- Enums
CREATE TYPE public.fag_regime AS ENUM ('nek', 'fel', 'fse', 'fsl', 'annet');
CREATE TYPE public.fag_priority AS ENUM ('normal', 'viktig');
CREATE TYPE public.fag_status AS ENUM ('new', 'analyzing', 'answered', 'needs_followup', 'error');

-- Main table
CREATE TABLE public.fag_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  created_by_user_id uuid NOT NULL,
  regime public.fag_regime NOT NULL,
  question text NOT NULL,
  priority public.fag_priority NOT NULL DEFAULT 'normal',
  status public.fag_status NOT NULL DEFAULT 'new',
  image_paths text[] NOT NULL DEFAULT '{}',
  ai_summary text,
  ai_confidence int,
  ai_followup_questions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  linked_case_id uuid,
  linked_project_id uuid,
  linked_offer_id uuid
);

-- Indexes
CREATE INDEX idx_fag_requests_company_created ON public.fag_requests (company_id, created_at DESC);
CREATE INDEX idx_fag_requests_company_status ON public.fag_requests (company_id, status);

-- Answers history table
CREATE TABLE public.fag_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fag_request_id uuid NOT NULL REFERENCES public.fag_requests(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  answer_markdown text NOT NULL,
  model text,
  tokens_in int,
  tokens_out int,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'ai'
);

CREATE INDEX idx_fag_answers_request ON public.fag_answers (fag_request_id, created_at DESC);

-- Updated_at trigger
CREATE TRIGGER fag_requests_updated_at
  BEFORE UPDATE ON public.fag_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.fag_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fag_answers ENABLE ROW LEVEL SECURITY;

-- fag_requests policies
CREATE POLICY "Admins manage fag_requests" ON public.fag_requests
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Users with fag.view can read fag_requests" ON public.fag_requests
  FOR SELECT USING (
    is_admin() OR (
      check_permission(auth.uid(), 'fag.view') AND
      EXISTS (
        SELECT 1 FROM public.user_memberships um
        WHERE um.user_id = auth.uid() AND um.company_id = fag_requests.company_id AND um.is_active = true
      )
    )
  );

CREATE POLICY "Users with fag.create can insert fag_requests" ON public.fag_requests
  FOR INSERT WITH CHECK (
    is_admin() OR (
      check_permission(auth.uid(), 'fag.create') AND
      EXISTS (
        SELECT 1 FROM public.user_memberships um
        WHERE um.user_id = auth.uid() AND um.company_id = fag_requests.company_id AND um.is_active = true
      )
    )
  );

CREATE POLICY "Users with fag.create can update own fag_requests" ON public.fag_requests
  FOR UPDATE USING (
    is_admin() OR (
      created_by_user_id = auth.uid() AND
      check_permission(auth.uid(), 'fag.create')
    )
  );

-- fag_answers policies
CREATE POLICY "Admins manage fag_answers" ON public.fag_answers
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Users with fag.view can read fag_answers" ON public.fag_answers
  FOR SELECT USING (
    is_admin() OR (
      check_permission(auth.uid(), 'fag.view') AND
      EXISTS (
        SELECT 1 FROM public.user_memberships um
        WHERE um.user_id = auth.uid() AND um.company_id = fag_answers.company_id AND um.is_active = true
      )
    )
  );

CREATE POLICY "System can insert fag_answers" ON public.fag_answers
  FOR INSERT WITH CHECK (is_admin());

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('fag-attachments', 'fag-attachments', false);

-- Storage policies
CREATE POLICY "fag_read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'fag-attachments' AND (
      public.is_admin() OR public.check_permission(auth.uid(), 'fag.view')
    )
  );

CREATE POLICY "fag_write" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'fag-attachments' AND (
      public.is_admin() OR public.check_permission(auth.uid(), 'fag.create')
    )
  );

CREATE POLICY "fag_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'fag-attachments' AND public.is_admin()
  );
