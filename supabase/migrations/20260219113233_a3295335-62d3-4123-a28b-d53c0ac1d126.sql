
-- Allow authenticated users to upload to job-attachments bucket
CREATE POLICY "Authenticated users can upload job attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'job-attachments');

-- Allow authenticated users to view job attachments
CREATE POLICY "Authenticated users can view job attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'job-attachments');

-- Allow admins to delete job attachments
CREATE POLICY "Admins can delete job attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'job-attachments' AND public.is_admin());
