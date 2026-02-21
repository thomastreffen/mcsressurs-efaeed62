
-- Add review_comment and parent_id columns
ALTER TABLE public.regulation_queries 
  ADD COLUMN IF NOT EXISTS review_comment text,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.regulation_queries(id);

-- Index for version chain lookups
CREATE INDEX IF NOT EXISTS idx_regulation_queries_parent_id ON public.regulation_queries(parent_id);
