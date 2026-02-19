
-- Create storage bucket for calculation attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('calculation-attachments', 'calculation-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for calculation-attachments
CREATE POLICY "Authenticated users can upload calculation attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'calculation-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view calculation attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'calculation-attachments');

CREATE POLICY "Admins can delete calculation attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'calculation-attachments' AND public.is_admin());
