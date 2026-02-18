
-- Remove duplicate user_roles rows (keep the one with smallest id)
DELETE FROM public.user_roles ur
USING public.user_roles ur2
WHERE ur.user_id = ur2.user_id
AND ur.id > ur2.id;

-- Add unique constraint on user_id
ALTER TABLE public.user_roles
ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);
