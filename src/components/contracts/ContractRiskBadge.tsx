import { cn } from "@/lib/utils";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

interface ContractRiskBadgeProps {
  riskLevel: string;
  riskScore?: number;
  size?: "sm" | "md";
}

const RISK_CONFIG: Record<string, { label: string; className: string; icon: typeof ShieldCheck }> = {
  green: {
    label: "Lav risiko",
    className: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
    icon: ShieldCheck,
  },
  yellow: {
    label: "Middels risiko",
    className: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
    icon: ShieldQuestion,
  },
  red: {
    label: "Høy risiko",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
    icon: ShieldAlert,
  },
};

export function ContractRiskBadge({ riskLevel, riskScore, size = "sm" }: ContractRiskBadgeProps) {
  const config = RISK_CONFIG[riskLevel] || RISK_CONFIG.green;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        config.className,
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {config.label}
      {riskScore != null && <span className="font-mono">({riskScore})</span>}
    </span>
  );
}
