import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface Contract {
  id: string;
  company_id: string;
  department_id: string | null;
  title: string;
  counterparty_name: string | null;
  executing_company_ids: string[];
  lead_id: string | null;
  job_id: string | null;
  status: string;
  contract_type: string | null;
  signed_date: string | null;
  start_date: string | null;
  end_date: string | null;
  penalty_type: string | null;
  penalty_rate: number | null;
  penalty_unit: string | null;
  warranty_months: number | null;
  ai_summary_pl: string | null;
  ai_summary_econ: string | null;
  ai_summary_field: string | null;
  risk_score: number;
  risk_level: string;
  ai_confidence: number;
  last_analyzed_at: string | null;
  last_analyzed_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ContractDeadline {
  id: string;
  contract_id: string;
  job_id: string | null;
  type: string;
  title: string;
  due_date: string;
  severity: string;
  status: string;
  owner_user_id: string | null;
  created_at: string;
}

export interface ContractDocument {
  id: string;
  contract_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  version: number;
  is_primary: boolean;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface ContractAlert {
  id: string;
  contract_id: string;
  job_id: string | null;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  due_date: string | null;
  is_read: boolean;
  created_at: string;
}

export function useContracts() {
  return useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Contract[];
    },
  });
}

export function useContract(id: string | undefined) {
  return useQuery({
    queryKey: ["contract", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as Contract;
    },
  });
}

export function useContractDeadlines(contractId: string | undefined) {
  return useQuery({
    queryKey: ["contract-deadlines", contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_deadlines")
        .select("*")
        .eq("contract_id", contractId!)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data as unknown as ContractDeadline[];
    },
  });
}

export function useContractDocuments(contractId: string | undefined) {
  return useQuery({
    queryKey: ["contract-documents", contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_documents")
        .select("*")
        .eq("contract_id", contractId!)
        .order("version", { ascending: false });
      if (error) throw error;
      return data as unknown as ContractDocument[];
    },
  });
}

export function useContractAlerts(contractId?: string) {
  return useQuery({
    queryKey: ["contract-alerts", contractId],
    queryFn: async () => {
      let query = supabase
        .from("contract_alerts")
        .select("*")
        .eq("is_read", false)
        .order("created_at", { ascending: false });
      if (contractId) query = query.eq("contract_id", contractId);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as ContractAlert[];
    },
  });
}

export function useContractsByJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ["contracts-by-job", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("job_id", jobId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Contract[];
    },
  });
}

export function useCreateContract() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      title: string;
      company_id: string;
      department_id?: string;
      counterparty_name?: string;
      lead_id?: string;
      job_id?: string;
      contract_type?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("contracts")
        .insert({
          ...input,
          created_by: user.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("Kontrakt opprettet");
    },
    onError: (err: Error) => {
      toast.error("Kunne ikke opprette kontrakt", { description: err.message });
    },
  });
}

export function useAnalyzeContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contractId: string) => {
      const { data, error } = await supabase.functions.invoke("contract-ai", {
        body: { action: "analyze_contract", contract_id: contractId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, contractId) => {
      queryClient.invalidateQueries({ queryKey: ["contract", contractId] });
      queryClient.invalidateQueries({ queryKey: ["contract-deadlines", contractId] });
      queryClient.invalidateQueries({ queryKey: ["contract-alerts"] });
      toast.success("AI-analyse fullført");
    },
    onError: (err: Error) => {
      toast.error("AI-analyse feilet", { description: err.message });
    },
  });
}
