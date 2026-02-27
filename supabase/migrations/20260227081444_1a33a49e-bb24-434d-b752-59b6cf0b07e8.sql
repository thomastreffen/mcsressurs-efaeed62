-- Make calculation-attachments bucket private
UPDATE storage.buckets SET public = false WHERE id = 'calculation-attachments';

-- Drop the old public policy if it exists
DROP POLICY IF EXISTS "Anyone can view calculation attachments" ON storage.objects;