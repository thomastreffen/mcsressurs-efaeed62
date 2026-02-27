-- Backfill resolution_type for converted cases that have linked IDs but no resolution_type
UPDATE public.cases
SET resolution_type = CASE
  WHEN linked_offer_id IS NOT NULL THEN 'converted_to_offer'
  WHEN linked_project_id IS NOT NULL THEN 'converted_to_project'
  WHEN linked_work_order_id IS NOT NULL THEN 'converted_to_service'
  WHEN linked_lead_id IS NOT NULL THEN 'converted_to_lead'
  ELSE NULL
END
WHERE status = 'converted'
  AND resolution_type IS NULL
  AND (linked_offer_id IS NOT NULL OR linked_project_id IS NOT NULL OR linked_work_order_id IS NOT NULL OR linked_lead_id IS NOT NULL);