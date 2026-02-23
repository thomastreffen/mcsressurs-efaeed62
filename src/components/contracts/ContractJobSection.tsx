import { useContractsByJob, useContractAlerts } from "@/hooks/useContracts";
import { ContractRiskBadge } from "./ContractRiskBadge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { FileText, AlertTriangle, Clock, Bell, ShieldAlert } from "lucide-react";
import { differenceInDays, isPast, isToday } from "date-fns";

interface ContractJobSectionProps {
  jobId: string;
}

function relativeDeadline(dateStr: string): { text: string; urgent: boolean } {
  const date = new Date(dateStr);
  if (isPast(date) && !isToday(date)) return { text: "Forfalt", urgent: true };
  if (isToday(date)) return { text: "I dag", urgent: true };
  const days = differenceInDays(date, new Date());
  if (days <= 7) return { text: `om ${days} dager`, urgent: true };
  return { text: `om ${days} dager`, urgent: false };
}

export function ContractJobSection({ jobId }: ContractJobSectionProps) {
  const { data: contracts, isLoading } = useContractsByJob(jobId);
  const { data: alerts } = useContractAlerts();
  const navigate = useNavigate();

  if (isLoading) return null;
  if (!contracts || contracts.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Ingen kontrakter knyttet til denne jobben.
      </div>
    );
  }

  // Aggregate across all contracts for this job
  const jobAlerts = (alerts ?? []).filter((a) => a.job_id === jobId && !a.is_read);
  const criticalAlerts = jobAlerts.filter((a) => a.severity === "critical");
  const unreadCount = jobAlerts.length;

  // Find earliest open deadline across contracts
  const firstContract = contracts[0];
  const hasPenalty = contracts.some(
    (c) => c.penalty_type && c.penalty_type !== "ingen"
  );

  // Determine next deadline from contract end_dates (simplified; real deadlines come from contract_deadlines)
  const nextDeadlineContract = contracts
    .filter((c) => c.end_date)
    .sort((a, b) => new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime())[0];

  const deadlineInfo = nextDeadlineContract?.end_date
    ? relativeDeadline(nextDeadlineContract.end_date)
    : null;

  // Primary CTA logic
  const primaryAction = criticalAlerts.length > 0
    ? { label: "Se kritiske varsler", path: `/contracts/${criticalAlerts[0].contract_id}` }
    : deadlineInfo
    ? { label: "Se frister", path: `/contracts/${nextDeadlineContract!.id}` }
    : { label: "Åpne kontrakt", path: `/contracts/${firstContract.id}` };

  return (
    <div className="space-y-2.5">
      {/* Risk + Deadline row */}
      <div className="flex items-center justify-between gap-2">
        <ContractRiskBadge
          riskLevel={firstContract.risk_level}
          riskScore={firstContract.risk_score || undefined}
        />
        {deadlineInfo && (
          <span
            className={`flex items-center gap-1 text-xs font-medium ${
              deadlineInfo.urgent
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            <Clock className="h-3 w-3" />
            Frist {deadlineInfo.text}
          </span>
        )}
      </div>

      {/* Info lines – max 2 */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <ShieldAlert className="h-3 w-3" />
          Dagbot: {hasPenalty ? "Ja" : "Nei"}
        </span>
        {unreadCount > 0 && (
          <span className="flex items-center gap-1">
            <Bell className="h-3 w-3 text-orange-500" />
            Uleste varsler: {unreadCount}
          </span>
        )}
      </div>

      {/* Primary CTA */}
      <Button
        variant={criticalAlerts.length > 0 ? "destructive" : "default"}
        size="sm"
        className="rounded-xl text-xs gap-1.5 w-full sm:w-auto"
        onClick={() => navigate(primaryAction.path)}
      >
        {criticalAlerts.length > 0 ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
        {primaryAction.label}
      </Button>
    </div>
  );
}
