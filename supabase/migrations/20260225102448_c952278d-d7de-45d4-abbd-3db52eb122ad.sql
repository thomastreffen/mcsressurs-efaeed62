
-- Add personnel fields to technicians
ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS is_plannable_resource boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS hms_card_number text,
  ADD COLUMN IF NOT EXISTS hms_card_expires_at date,
  ADD COLUMN IF NOT EXISTS trade_certificate_type text,
  ADD COLUMN IF NOT EXISTS driver_license_classes text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

-- Create user_documents table
CREATE TABLE IF NOT EXISTS public.user_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other',
  file_name text NOT NULL,
  file_path text NOT NULL,
  expires_at date,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;

-- Only superadmins / admins can manage user_documents
CREATE POLICY "Admins can manage user_documents" ON public.user_documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Set existing technicians with user_id as plannable by default
UPDATE public.technicians SET is_plannable_resource = true WHERE user_id IS NOT NULL;
