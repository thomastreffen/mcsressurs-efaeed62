
-- Junction table for many-to-many events <-> technicians
CREATE TABLE public.event_technicians (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(event_id, technician_id)
);

-- Enable RLS
ALTER TABLE public.event_technicians ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage event_technicians"
ON public.event_technicians
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Technicians can view their own assignments
CREATE POLICY "Technicians can view own assignments"
ON public.event_technicians
FOR SELECT
USING (technician_id IN (
  SELECT id FROM public.technicians WHERE user_id = auth.uid()
));

-- Migrate existing data from events.technician_id
INSERT INTO public.event_technicians (event_id, technician_id)
SELECT id, technician_id FROM public.events WHERE technician_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Update events RLS to also consider event_technicians
DROP POLICY IF EXISTS "Admins see all events, technicians see own" ON public.events;
CREATE POLICY "Admins see all events, technicians see own"
ON public.events
FOR SELECT
USING (
  is_admin() OR id IN (
    SELECT event_id FROM public.event_technicians
    WHERE technician_id IN (
      SELECT id FROM public.technicians WHERE user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Admins can update all, technicians own" ON public.events;
CREATE POLICY "Admins can update all, technicians own"
ON public.events
FOR UPDATE
USING (
  is_admin() OR id IN (
    SELECT event_id FROM public.event_technicians
    WHERE technician_id IN (
      SELECT id FROM public.technicians WHERE user_id = auth.uid()
    )
  )
);

-- Enable realtime for event_technicians
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_technicians;

-- Storage bucket for job attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('job-attachments', 'job-attachments', false);

-- Storage policies
CREATE POLICY "Admins can upload attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'job-attachments' AND (SELECT is_admin()));

CREATE POLICY "Admins can view attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'job-attachments' AND (SELECT is_admin()));

CREATE POLICY "Admins can delete attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'job-attachments' AND (SELECT is_admin()));

CREATE POLICY "Technicians can view job attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'job-attachments' AND
  EXISTS (
    SELECT 1 FROM public.event_technicians et
    JOIN public.technicians t ON t.id = et.technician_id
    WHERE t.user_id = auth.uid()
    AND et.event_id::text = (storage.foldername(name))[1]
  )
);
