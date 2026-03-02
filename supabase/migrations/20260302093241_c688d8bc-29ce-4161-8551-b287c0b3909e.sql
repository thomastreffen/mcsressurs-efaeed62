
-- Add SharePoint columns to events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS sharepoint_project_code text,
  ADD COLUMN IF NOT EXISTS sharepoint_site_id text,
  ADD COLUMN IF NOT EXISTS sharepoint_drive_id text,
  ADD COLUMN IF NOT EXISTS sharepoint_folder_id text,
  ADD COLUMN IF NOT EXISTS sharepoint_folder_web_url text,
  ADD COLUMN IF NOT EXISTS sharepoint_connected_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_events_sharepoint_project_code ON public.events (sharepoint_project_code) WHERE sharepoint_project_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_sharepoint_folder_id ON public.events (sharepoint_folder_id) WHERE sharepoint_folder_id IS NOT NULL;

-- Create job_document_links table for tracking SharePoint documents
CREATE TABLE IF NOT EXISTS public.job_document_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  source text NOT NULL DEFAULT 'sharepoint',
  item_id text NOT NULL,
  name text NOT NULL,
  web_url text,
  mime_type text,
  file_size bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_document_links_job_id ON public.job_document_links (job_id);
CREATE INDEX IF NOT EXISTS idx_job_document_links_company_id ON public.job_document_links (company_id);

-- RLS for job_document_links
ALTER TABLE public.job_document_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view job_document_links in their company"
  ON public.job_document_links FOR SELECT
  USING (
    public.can_access_record(
      auth.uid(),
      company_id,
      NULL,
      uploaded_by,
      job_id
    )
  );

CREATE POLICY "Authenticated users can insert job_document_links"
  ON public.job_document_links FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete job_document_links"
  ON public.job_document_links FOR DELETE
  USING (public.is_admin());
