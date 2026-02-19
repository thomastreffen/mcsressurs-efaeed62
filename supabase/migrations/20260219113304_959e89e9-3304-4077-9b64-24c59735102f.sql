
-- Make bucket public so getPublicUrl works for viewing
UPDATE storage.buckets SET public = true WHERE id = 'job-attachments';
