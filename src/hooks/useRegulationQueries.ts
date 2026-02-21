import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RegulationQuery {
  id: string;
  created_at: string;
  created_by: string;
  scope_type: "global" | "lead" | "quote" | "job";
  scope_id: string | null;
  topic: string;
  question: string;
  context_text: string | null;
  context_json: any;
  answer_summary: string | null;
  answer_detail: string | null;
  actions: Array<{ title: string; description: string }>;
  pitfalls: Array<{ title: string; description: string }>;
  tags: string[];
  pinned: boolean;
}

export function useRegulationQueries(scopeType?: string, scopeId?: string) {
  const [queries, setQueries] = useState<RegulationQuery[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchQueries = useCallback(async (search?: string) => {
    setLoading(true);
    try {
      let q = supabase
        .from("regulation_queries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (scopeType && scopeId) {
        q = q.eq("scope_type", scopeType as any).eq("scope_id", scopeId);
      }

      if (search?.trim()) {
        q = q.ilike("question", `%${search}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      setQueries((data || []) as unknown as RegulationQuery[]);
    } catch (err) {
      console.warn("[useRegulationQueries] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [scopeType, scopeId]);

  const submitQuery = useCallback(async (params: {
    question: string;
    topic: string;
    scope_type?: string;
    scope_id?: string;
    context_text?: string;
    context_json?: any;
    company_id?: string;
  }) => {
    const { data, error } = await supabase.functions.invoke("regulation-query", {
      body: params,
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const togglePin = useCallback(async (id: string, pinned: boolean) => {
    await supabase
      .from("regulation_queries")
      .update({ pinned: !pinned })
      .eq("id", id);
    setQueries(prev => prev.map(q => q.id === id ? { ...q, pinned: !pinned } : q));
  }, []);

  return { queries, loading, fetchQueries, submitQuery, togglePin };
}
