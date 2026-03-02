
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS sharepoint_site_id text,
  ADD COLUMN IF NOT EXISTS sharepoint_drive_id text,
  ADD COLUMN IF NOT EXISTS sharepoint_base_path text;

COMMENT ON COLUMN public.company_settings.sharepoint_site_id IS 'Microsoft Graph site ID for SharePoint';
COMMENT ON COLUMN public.company_settings.sharepoint_drive_id IS 'Microsoft Graph drive ID for the document library';
COMMENT ON COLUMN public.company_settings.sharepoint_base_path IS 'Base folder path e.g. Drift, under which project folders live';
