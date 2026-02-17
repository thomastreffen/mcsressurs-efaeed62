
-- Add unique constraint on technicians email for upsert support
ALTER TABLE public.technicians ADD CONSTRAINT technicians_email_unique UNIQUE (email);
