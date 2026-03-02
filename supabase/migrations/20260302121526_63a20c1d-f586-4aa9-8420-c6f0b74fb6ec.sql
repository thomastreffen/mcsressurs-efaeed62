
CREATE TABLE public.document_category_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.internal_companies(id) ON DELETE CASCADE,
  category_key text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  sharepoint_relative_path text NOT NULL,
  read_only boolean NOT NULL DEFAULT false,
  icon text DEFAULT 'folder',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX document_category_mappings_company_category
  ON public.document_category_mappings (company_id, category_key);

ALTER TABLE public.document_category_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage category mappings"
  ON public.document_category_mappings
  FOR ALL
  TO authenticated
  USING (public.check_permission_v2(auth.uid(), 'sharepoint.admin'))
  WITH CHECK (public.check_permission_v2(auth.uid(), 'sharepoint.admin'));

CREATE POLICY "Authenticated users can read category mappings"
  ON public.document_category_mappings
  FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.document_category_mappings (company_id, category_key, display_name, sharepoint_relative_path, read_only, icon, sort_order)
SELECT ic.id, m.category_key, m.display_name, m.sharepoint_relative_path, m.read_only, m.icon, m.sort_order
FROM public.internal_companies ic
CROSS JOIN (VALUES
  ('images',       'Bilder',                    '90 Service/Bilder',                false, 'image',     1),
  ('reports',      'Servicerapporter',           '90 Service/Servicerapporter',      false, 'file-text', 2),
  ('deviations',   'Avvik',                      '90 Service/Avvik',                 false, 'alert-triangle', 3),
  ('other',        'Annet',                      '90 Service/Annet',                 false, 'folder',    4),
  ('drawings_ro',  'Tegninger',                  '22 Tegninger og Tavleskisser',     true,  'ruler',     5),
  ('boardpics_ro', 'Tavle- og anleggsbilder',    '26 Tavle og anleggsbilder',        true,  'image',     6)
) AS m(category_key, display_name, sharepoint_relative_path, read_only, icon, sort_order)
ON CONFLICT (company_id, category_key) DO NOTHING;
