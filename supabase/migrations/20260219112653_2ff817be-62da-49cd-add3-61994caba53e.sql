
-- Add color column to technicians for calendar color coding
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS color text DEFAULT NULL;

-- Add attachments jsonb column to events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;

-- Set default colors for existing technicians using a CTE
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.technicians
  WHERE color IS NULL
)
UPDATE public.technicians t SET color = CASE
  WHEN n.rn = 1 THEN '#3b82f6'
  WHEN n.rn = 2 THEN '#10b981'
  WHEN n.rn = 3 THEN '#f59e0b'
  WHEN n.rn = 4 THEN '#ef4444'
  WHEN n.rn = 5 THEN '#8b5cf6'
  ELSE '#6b7280'
END
FROM numbered n
WHERE t.id = n.id;
