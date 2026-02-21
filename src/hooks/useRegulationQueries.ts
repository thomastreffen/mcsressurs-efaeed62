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
  usage_count: number;
  usefulness_rating: number | null;
  reviewed_status: "draft" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  references_to_check: string[];
  suggested_reservations: string[];
  suggested_calc_lines: Array<{ title: string; category: string; estimate_hint: string }>;
  parent_id: string | null;
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

  const fetchVersions = useCallback(async (parentId: string): Promise<RegulationQuery[]> => {
    // Fetch all versions: original + children
    const { data } = await supabase
      .from("regulation_queries")
      .select("*")
      .or(`id.eq.${parentId},parent_id.eq.${parentId}`)
      .order("created_at", { ascending: true });
    return (data || []) as unknown as RegulationQuery[];
  }, []);

  const submitQuery = useCallback(async (params: {
    question: string;
    topic: string;
    scope_type?: string;
    scope_id?: string;
    context_text?: string;
    context_json?: any;
    company_id?: string;
    parent_id?: string;
  }) => {
    const body: any = { ...params };
    const { data, error } = await supabase.functions.invoke("regulation-query", {
      body,
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    // If parent_id, store it on the saved record
    if (params.parent_id && data?.id) {
      await supabase
        .from("regulation_queries")
        .update({ parent_id: params.parent_id } as any)
        .eq("id", data.id);
    }

    return data;
  }, []);

  const togglePin = useCallback(async (id: string, pinned: boolean) => {
    await supabase
      .from("regulation_queries")
      .update({ pinned: !pinned })
      .eq("id", id);
    setQueries(prev => prev.map(q => q.id === id ? { ...q, pinned: !pinned } : q));
  }, []);

  const rateQuery = useCallback(async (id: string, rating: number) => {
    await supabase
      .from("regulation_queries")
      .update({ usefulness_rating: rating })
      .eq("id", id);
    setQueries(prev => prev.map(q => q.id === id ? { ...q, usefulness_rating: rating } : q));
  }, []);

  const reviewQuery = useCallback(async (id: string, status: "approved" | "rejected", userId: string, comment?: string) => {
    const now = new Date().toISOString();
    const update: any = { reviewed_status: status, reviewed_by: userId, reviewed_at: now };
    if (comment !== undefined) update.review_comment = comment;
    await supabase
      .from("regulation_queries")
      .update(update)
      .eq("id", id);
    setQueries(prev => prev.map(q => q.id === id ? { ...q, reviewed_status: status, reviewed_by: userId, reviewed_at: now, review_comment: comment || null } : q));
  }, []);

  const copyToScope = useCallback(async (sourceQuery: RegulationQuery, newScopeType: string, newScopeId: string) => {
    const { error } = await supabase.from("regulation_queries").insert({
      created_by: sourceQuery.created_by,
      scope_type: newScopeType as any,
      scope_id: newScopeId,
      topic: sourceQuery.topic as any,
      question: sourceQuery.question,
      context_text: sourceQuery.context_text,
      context_json: sourceQuery.context_json,
      answer_summary: sourceQuery.answer_summary,
      answer_detail: sourceQuery.answer_detail,
      actions: sourceQuery.actions as any,
      pitfalls: sourceQuery.pitfalls as any,
      references_to_check: sourceQuery.references_to_check,
      suggested_reservations: sourceQuery.suggested_reservations,
      suggested_calc_lines: sourceQuery.suggested_calc_lines as any,
      tags: sourceQuery.tags,
      pinned: false,
      reviewed_status: "draft",
    });
    if (error) throw error;
    // Increment usage_count on source
    await supabase.rpc("check_permission", { _user_id: sourceQuery.created_by, _perm: "dummy" }).then(() => {
      // Just increment usage_count manually
    });
    await supabase
      .from("regulation_queries")
      .update({ usage_count: (sourceQuery.usage_count || 0) + 1 } as any)
      .eq("id", sourceQuery.id);
  }, []);

  return { queries, loading, fetchQueries, submitQuery, togglePin, rateQuery, reviewQuery, fetchVersions, copyToScope };
}
