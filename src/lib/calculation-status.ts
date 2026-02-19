export type CalculationStatus = "draft" | "generated" | "sent" | "accepted" | "rejected" | "converted";

export interface CalculationStatusConfig {
  label: string;
  className: string;
}

export const CALCULATION_STATUS_CONFIG: Record<CalculationStatus, CalculationStatusConfig> = {
  draft: { label: "Utkast", className: "bg-muted text-muted-foreground" },
  generated: { label: "Generert", className: "bg-primary/15 text-primary" },
  sent: { label: "Sendt", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  accepted: { label: "Akseptert", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  rejected: { label: "Avslått", className: "bg-destructive/15 text-destructive" },
  converted: { label: "Konvertert", className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
};

export const ALL_CALCULATION_STATUSES: CalculationStatus[] = [
  "draft", "generated", "sent", "accepted", "rejected", "converted",
];
