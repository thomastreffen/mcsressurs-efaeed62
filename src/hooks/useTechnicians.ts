import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TechnicianInfo {
  id: string;
  name: string;
  email: string;
  color?: string;
}

let cachedTechnicians: TechnicianInfo[] | null = null;

export function useTechnicians() {
  const [technicians, setTechnicians] = useState<TechnicianInfo[]>(cachedTechnicians || []);
  const [loading, setLoading] = useState(!cachedTechnicians);

  useEffect(() => {
    if (cachedTechnicians) return;
    supabase
      .from("technicians")
      .select("id, name, email, color")
      .eq("is_plannable_resource", true)
      .is("archived_at", null)
      .order("name")
      .then(({ data }) => {
        const result = data || [];
        cachedTechnicians = result;
        setTechnicians(result);
        setLoading(false);
      });
  }, []);

  return { technicians, loading };
}
