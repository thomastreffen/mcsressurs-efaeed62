import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ContractRiskBadge } from "./ContractRiskBadge";
import { CreateContractDialog } from "./CreateContractDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileSignature, Plus } from "lucide-react";
import type { Contract } from "@/hooks/useContracts";

interface ContractListSectionProps {
  entityType: "job" | "lead";
  entityId: string;
}

export function ContractListSection({ entityType, entityId }: ContractListSectionProps) {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: contracts, isLoading } = useQuery({
    queryKey: ["contracts-by-entity", entityType, entityId],
    queryFn: async () => {
      const col = entityType === "job" ? "job_id" : "lead_id";
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq(col, entityId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Contract[];
    },
  });

  if (isLoading) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Kontrakter</h3>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Ny kontrakt
        </Button>
      </div>
      {(!contracts || contracts.length === 0) ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <FileSignature className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Ingen kontrakter knyttet til denne {entityType === "job" ? "jobben" : "leaden"}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {contracts.map((c) => (
            <Card key={c.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/contracts/${c.id}`)}>
              <CardContent className="flex items-center gap-3 py-3">
                <FileSignature className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.counterparty_name || "Ingen motpart"} · {c.contract_type || "Ukjent type"}
                  </p>
                </div>
                <ContractRiskBadge riskLevel={c.risk_level} riskScore={c.risk_score || undefined} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateContractDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        {...(entityType === "job" ? { defaultJobId: entityId } : { defaultLeadId: entityId })}
      />
    </div>
  );
}
