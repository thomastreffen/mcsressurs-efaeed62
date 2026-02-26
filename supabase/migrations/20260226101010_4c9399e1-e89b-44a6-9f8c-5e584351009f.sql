
-- =====================================================
-- FIX 1: Restrict company_settings to authenticated only
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can view company settings" ON public.company_settings;
CREATE POLICY "Authenticated users can view company settings"
  ON public.company_settings FOR SELECT
  TO authenticated
  USING (true);

-- =====================================================
-- FIX 2: Restrict tenant_settings to authenticated only
-- =====================================================
DROP POLICY IF EXISTS "Authenticated can view tenant_settings" ON public.tenant_settings;
CREATE POLICY "Authenticated can view tenant_settings"
  ON public.tenant_settings FOR SELECT
  TO authenticated
  USING (true);

-- =====================================================
-- FIX 3: Replace overly permissive job_tasks policies
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can view job tasks" ON public.job_tasks;
DROP POLICY IF EXISTS "Authenticated users can insert job tasks" ON public.job_tasks;
DROP POLICY IF EXISTS "Authenticated users can update job tasks" ON public.job_tasks;
DROP POLICY IF EXISTS "Authenticated users can delete job tasks" ON public.job_tasks;

-- SELECT: admins or technicians assigned to the job
CREATE POLICY "Job tasks select"
  ON public.job_tasks FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM public.event_technicians et
      JOIN public.technicians t ON t.id = et.technician_id
      WHERE et.event_id = job_tasks.job_id AND t.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.job_participants jp
      WHERE jp.job_id = job_tasks.job_id AND jp.user_id = auth.uid()
    )
  );

-- INSERT: admins or job participants/technicians
CREATE POLICY "Job tasks insert"
  ON public.job_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM public.event_technicians et
      JOIN public.technicians t ON t.id = et.technician_id
      WHERE et.event_id = job_tasks.job_id AND t.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.job_participants jp
      WHERE jp.job_id = job_tasks.job_id AND jp.user_id = auth.uid()
    )
  );

-- UPDATE: admins or job participants/technicians
CREATE POLICY "Job tasks update"
  ON public.job_tasks FOR UPDATE
  TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM public.event_technicians et
      JOIN public.technicians t ON t.id = et.technician_id
      WHERE et.event_id = job_tasks.job_id AND t.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.job_participants jp
      WHERE jp.job_id = job_tasks.job_id AND jp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM public.event_technicians et
      JOIN public.technicians t ON t.id = et.technician_id
      WHERE et.event_id = job_tasks.job_id AND t.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.job_participants jp
      WHERE jp.job_id = job_tasks.job_id AND jp.user_id = auth.uid()
    )
  );

-- DELETE: admins only
CREATE POLICY "Job tasks delete"
  ON public.job_tasks FOR DELETE
  TO authenticated
  USING (is_admin());

-- =====================================================
-- FIX 4: Replace overly permissive job_task_notes policies
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can view task notes" ON public.job_task_notes;
DROP POLICY IF EXISTS "Authenticated users can insert task notes" ON public.job_task_notes;
DROP POLICY IF EXISTS "Authenticated users can delete task notes" ON public.job_task_notes;

-- SELECT: admins or technicians/participants of the parent job
CREATE POLICY "Task notes select"
  ON public.job_task_notes FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM public.job_tasks jt
      JOIN public.event_technicians et ON et.event_id = jt.job_id
      JOIN public.technicians t ON t.id = et.technician_id
      WHERE jt.id = job_task_notes.task_id AND t.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.job_tasks jt
      JOIN public.job_participants jp ON jp.job_id = jt.job_id
      WHERE jt.id = job_task_notes.task_id AND jp.user_id = auth.uid()
    )
  );

-- INSERT: admins or technicians/participants
CREATE POLICY "Task notes insert"
  ON public.job_task_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM public.job_tasks jt
      JOIN public.event_technicians et ON et.event_id = jt.job_id
      JOIN public.technicians t ON t.id = et.technician_id
      WHERE jt.id = job_task_notes.task_id AND t.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.job_tasks jt
      JOIN public.job_participants jp ON jp.job_id = jt.job_id
      WHERE jt.id = job_task_notes.task_id AND jp.user_id = auth.uid()
    )
  );

-- DELETE: admins or note creator
CREATE POLICY "Task notes delete"
  ON public.job_task_notes FOR DELETE
  TO authenticated
  USING (
    is_admin()
    OR created_by = auth.uid()
  );

-- =====================================================
-- FIX 5: Make calculation-attachments bucket private
-- =====================================================
UPDATE storage.buckets
SET public = false
WHERE id = 'calculation-attachments';

-- Replace public policy with authenticated-only
DROP POLICY IF EXISTS "Anyone can view calculation attachments" ON storage.objects;
CREATE POLICY "Authenticated users can view calculation attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'calculation-attachments');
