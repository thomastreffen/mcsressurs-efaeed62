import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useActionRequired() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    async function fetch() {
      const { count: c, error } = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("status", "time_change_proposed");

      if (!error && c !== null) setCount(c);
    }

    fetch();

    const channel = supabase
      .channel("action-required")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => {
        fetch();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return count;
}
