
-- Add review/rating fields to regulation_queries
ALTER TABLE public.regulation_queries
  ADD COLUMN IF NOT EXISTS usefulness_rating smallint,
  ADD COLUMN IF NOT EXISTS reviewed_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS references_to_check text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS suggested_reservations text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS suggested_calc_lines jsonb DEFAULT '[]';

-- Add constraint for usefulness_rating
ALTER TABLE public.regulation_queries
  ADD CONSTRAINT regulation_queries_usefulness_rating_check CHECK (usefulness_rating IN (-1, 0, 1));

-- Add constraint for reviewed_status  
ALTER TABLE public.regulation_queries
  ADD CONSTRAINT regulation_queries_reviewed_status_check CHECK (reviewed_status IN ('draft', 'approved', 'rejected'));
