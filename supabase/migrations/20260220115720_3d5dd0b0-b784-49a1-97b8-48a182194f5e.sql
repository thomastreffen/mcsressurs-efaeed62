
-- Add unique constraint on (job_id, user_id, provider) to prevent duplicate links
-- First check for existing duplicates and clean them (keep the newest)
DELETE FROM public.job_calendar_links a
USING public.job_calendar_links b
WHERE a.id < b.id
  AND a.job_id = b.job_id
  AND a.user_id = b.user_id
  AND a.provider = b.provider;

-- Now add the unique constraint
ALTER TABLE public.job_calendar_links
ADD CONSTRAINT job_calendar_links_job_user_provider_unique
UNIQUE (job_id, user_id, provider);
