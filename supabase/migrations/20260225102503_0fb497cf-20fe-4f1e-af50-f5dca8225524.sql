
-- Create storage bucket for user documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-documents', 'user-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for user-documents bucket: admins only
CREATE POLICY "Admins can manage user docs storage" ON storage.objects
  AS PERMISSIVE FOR ALL TO authenticated
  USING (bucket_id = 'user-documents' AND (SELECT is_admin()))
  WITH CHECK (bucket_id = 'user-documents' AND (SELECT is_admin()));
