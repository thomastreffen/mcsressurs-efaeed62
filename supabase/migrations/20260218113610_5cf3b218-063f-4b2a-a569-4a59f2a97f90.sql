
-- Make technicians.user_id NOT NULL and UNIQUE (FK already exists)
ALTER TABLE public.technicians 
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.technicians 
  ADD CONSTRAINT technicians_user_id_unique UNIQUE (user_id);
