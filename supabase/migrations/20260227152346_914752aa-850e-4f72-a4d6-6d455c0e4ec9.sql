
-- Create tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.internal_companies(id),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  due_at timestamptz,
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  estimated_minutes integer,
  created_by uuid NOT NULL,
  source_case_id uuid REFERENCES public.cases(id),
  source_case_item_id uuid REFERENCES public.case_items(id),
  linked_work_order_id uuid,
  linked_project_id uuid,
  linked_lead_id uuid,
  linked_offer_id uuid,
  ai_suggested boolean NOT NULL DEFAULT false,
  ai_confidence real,
  ai_rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create task_assignees table with role and soft-delete
CREATE TABLE IF NOT EXISTS public.task_assignees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'executor',
  notified_at timestamptz,
  calendar_event_id text,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create task_attachments table
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique active assignee per task
CREATE UNIQUE INDEX idx_task_assignees_unique_active ON public.task_assignees (task_id, user_id) WHERE removed_at IS NULL;
CREATE INDEX idx_task_assignees_user_id ON public.task_assignees (user_id) WHERE removed_at IS NULL;
CREATE INDEX idx_task_assignees_task_id ON public.task_assignees (task_id) WHERE removed_at IS NULL;
CREATE INDEX idx_tasks_status ON public.tasks (status);
CREATE INDEX idx_tasks_due_at ON public.tasks (due_at);
CREATE INDEX idx_tasks_company_id ON public.tasks (company_id);

-- Updated_at trigger for tasks
CREATE TRIGGER set_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

-- Tasks: company members can read
CREATE POLICY "Tasks select by company" ON public.tasks FOR SELECT
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.user_memberships um
      WHERE um.user_id = auth.uid() AND um.company_id = tasks.company_id AND um.is_active = true
    )
  );

-- Tasks: admin or creator or assignee can update
CREATE POLICY "Tasks update by owner or assignee" ON public.tasks FOR UPDATE
  USING (
    is_admin() OR created_by = auth.uid() OR EXISTS (
      SELECT 1 FROM public.task_assignees ta
      WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid() AND ta.removed_at IS NULL
    )
  );

-- Tasks: company members can insert
CREATE POLICY "Tasks insert by company member" ON public.tasks FOR INSERT
  WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.user_memberships um
      WHERE um.user_id = auth.uid() AND um.company_id = tasks.company_id AND um.is_active = true
    )
  );

-- Tasks: admin or creator can delete
CREATE POLICY "Tasks delete by admin or creator" ON public.tasks FOR DELETE
  USING (is_admin() OR created_by = auth.uid());

-- Task assignees: visible if you can see the task
CREATE POLICY "Task assignees select" ON public.task_assignees FOR SELECT
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.user_memberships um ON um.company_id = t.company_id
      WHERE t.id = task_assignees.task_id AND um.user_id = auth.uid() AND um.is_active = true
    )
  );

-- Task assignees: insert/update/delete by admin or task creator
CREATE POLICY "Task assignees manage" ON public.task_assignees FOR ALL
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.tasks t WHERE t.id = task_assignees.task_id AND t.created_by = auth.uid()
    )
  )
  WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.tasks t WHERE t.id = task_assignees.task_id AND t.created_by = auth.uid()
    )
  );

-- Task attachments: same as task visibility
CREATE POLICY "Task attachments select" ON public.task_attachments FOR SELECT
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.user_memberships um ON um.company_id = t.company_id
      WHERE t.id = task_attachments.task_id AND um.user_id = auth.uid() AND um.is_active = true
    )
  );

CREATE POLICY "Task attachments manage" ON public.task_attachments FOR ALL
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.tasks t WHERE t.id = task_attachments.task_id AND t.created_by = auth.uid()
    )
  )
  WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.tasks t WHERE t.id = task_attachments.task_id AND t.created_by = auth.uid()
    )
  );
