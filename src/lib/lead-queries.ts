import { supabase } from "@/integrations/supabase/client";

/**
 * Centralized active-leads query.
 * Active = deleted_at IS NULL AND archived_at IS NULL.
 *
 * Because archived_at may not be in generated types yet, we use raw filter.
 */
export async function fetchActiveLeads(selectCols = "*") {
  const { data, error } = await supabase
    .from("leads")
    .select(selectCols)
    .is("deleted_at", null)
    .filter("archived_at", "is", "null");
  return { data: (data || []) as any[], error };
}

/** Deleted leads (trash) */
export async function fetchDeletedLeads(selectCols = "*") {
  const { data, error } = await supabase
    .from("leads")
    .select(selectCols)
    .not("deleted_at", "is", null);
  return { data: (data || []) as any[], error };
}

/** Archived leads */
export async function fetchArchivedLeads(selectCols = "*") {
  const { data, error } = await supabase
    .from("leads")
    .select(selectCols)
    .is("deleted_at", null)
    .not("archived_at" as any, "is", null);
  return { data: (data || []) as any[], error };
}
