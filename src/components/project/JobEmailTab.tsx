import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CaseEmailViewer } from "@/components/cases/CaseEmailViewer";
import { Loader2, Mail } from "lucide-react";

interface JobEmailTabProps {
  jobId: string;
  linkField: "linked_work_order_id" | "linked_project_id";
}

export function JobEmailTab({ jobId, linkField }: JobEmailTabProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    // Find cases linked to this job/project
    const { data: cases } = await supabase
      .from("cases")
      .select("id")
      .eq(linkField, jobId);

    if (!cases || cases.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const caseIds = cases.map((c: any) => c.id);
    const { data } = await supabase
      .from("case_items")
      .select("*")
      .in("case_id", caseIds)
      .eq("type", "email")
      .order("created_at", { ascending: true });

    setItems((data as any[]) || []);
    setLoading(false);
  }, [jobId, linkField]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Mail className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">Ingen e-poster koblet</p>
        <p className="text-xs mt-1">Koble en sak fra Postkontoret for å se e-poster her</p>
      </div>
    );
  }

  return <CaseEmailViewer items={items} />;
}
