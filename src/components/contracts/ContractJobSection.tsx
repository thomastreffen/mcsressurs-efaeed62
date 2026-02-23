import { useContractsByJob, useContractAlerts } from "@/hooks/useContracts";
import { ContractRiskBadge } from "./ContractRiskBadge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { FileText, CalendarDays, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface ContractJobSectionProps {
  jobId: string;
}

export function ContractJobSection({ jobId }: ContractJobSectionProps) {
  const { data: contracts, isLoading } = useContractsByJob(jobId);
  const navigate = useNavigate();

  if (isLoading) return null;
  if (!contracts || contracts.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Ingen kontrakter knyttet til denne jobben.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {contracts.map((c) => (
        <div key={c.id} className="rounded-xl border border-border/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium truncate">{c.title}</span>
            </div>
            <ContractRiskBadge riskLevel={c.risk_level} riskScore={c.risk_score || undefined} />
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {c.end_date && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Frist: {format(new Date(c.end_date), "d. MMM yyyy", { locale: nb })}
              </span>
            )}
            {c.penalty_type && c.penalty_type !== "ingen" && (
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-orange-500" />
                Dagbot: {c.penalty_type}
                {c.penalty_rate ? ` ${c.penalty_rate} ${c.penalty_unit || ""}` : ""}
              </span>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="rounded-xl text-xs gap-1.5"
            onClick={() => navigate(`/contracts/${c.id}`)}
          >
            Åpne kontrakt
          </Button>
        </div>
      ))}
    </div>
  );
}
