import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TechnicianInfo {
  id: string;
  name: string;
  email: string;
}

let cachedTechnicians: TechnicianInfo[] | null = null;

export function useTechnicians() {
  const [technicians, setTechnicians] = useState<TechnicianInfo[]>(cachedTechnicians || []);
  const [loading, setLoading] = useState(!cachedTechnicians);

  useEffect(() => {
    if (cachedTechnicians) return;
    supabase
      .from("technicians")
      .select("id, name, email")
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
