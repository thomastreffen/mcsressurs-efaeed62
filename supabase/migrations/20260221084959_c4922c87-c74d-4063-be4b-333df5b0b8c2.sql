
-- Enum for scope type
CREATE TYPE public.regulation_scope_type AS ENUM ('global', 'lead', 'quote', 'job');

-- Enum for topic
CREATE TYPE public.regulation_topic AS ENUM ('NEK', 'FEL', 'FSE', 'FSL', 'Annet');

-- Main table
CREATE TABLE public.regulation_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  company_id uuid REFERENCES public.internal_companies(id),
  scope_type public.regulation_scope_type NOT NULL DEFAULT 'global',
  scope_id uuid,
  topic public.regulation_topic NOT NULL DEFAULT 'Annet',
  question text NOT NULL,
  context_text text,
  context_json jsonb,
  answer_summary text,
  answer_detail text,
  actions jsonb DEFAULT '[]'::jsonb,
  pitfalls jsonb DEFAULT '[]'::jsonb,
  tags text[] DEFAULT '{}',
  pinned boolean NOT NULL DEFAULT false
);

-- Enable RLS
ALTER TABLE public.regulation_queries ENABLE ROW LEVEL SECURITY;

-- Policy: creator always sees own
CREATE POLICY "Users can view own regulation queries"
ON public.regulation_queries FOR SELECT
USING (created_by = auth.uid());

-- Policy: global queries visible to all authenticated
CREATE POLICY "Authenticated can view global queries"
ON public.regulation_queries FOR SELECT
USING (scope_type = 'global');

-- Policy: scoped queries visible via can_access_record for jobs
CREATE POLICY "Users can view job-scoped queries"
ON public.regulation_queries FOR SELECT
USING (
  scope_type = 'job' AND scope_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = regulation_queries.scope_id
    AND (
      is_admin()
      OR e.id IN (
        SELECT et.event_id FROM public.event_technicians et
        JOIN public.technicians t ON t.id = et.technician_id
        WHERE t.user_id = auth.uid()
      )
    )
  )
);

-- Policy: quote/lead scoped visible to admins
CREATE POLICY "Admins can view quote and lead scoped queries"
ON public.regulation_queries FOR SELECT
USING (scope_type IN ('quote', 'lead') AND is_admin());

-- Policy: authenticated users can insert
CREATE POLICY "Authenticated users can insert regulation queries"
ON public.regulation_queries FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Policy: creator can update own (pin/unpin)
CREATE POLICY "Users can update own regulation queries"
ON public.regulation_queries FOR UPDATE
USING (created_by = auth.uid());

-- Policy: admins full access
CREATE POLICY "Admins full access regulation queries"
ON public.regulation_queries FOR ALL
USING (is_admin())
WITH CHECK (is_admin());
