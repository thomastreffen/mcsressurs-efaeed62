/** Labels and mappings for change order module */

export const REASON_TYPE_LABELS: Record<string, string> = {
  customer_change: "Kundeendring",
  unforeseen_condition: "Uforutsett forhold",
  missing_information: "Mangelfull informasjon",
  design_change: "Prosjektendring",
  coordination: "Koordinering",
  other: "Annet",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Utkast",
  sent: "Sendt til kunde",
  approved: "Godkjent",
  rejected: "Avvist",
  cancelled: "Kansellert",
  invoiced: "Fakturert",
};

export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-info/10 text-info border-info/20",
  approved: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-muted text-muted-foreground",
  invoiced: "bg-primary/10 text-primary border-primary/20",
};

export function getReasonLabel(key: string): string {
  return REASON_TYPE_LABELS[key] || key;
}

export function getStatusLabel(key: string): string {
  return STATUS_LABELS[key] || key;
}

export function getStatusColor(key: string): string {
  return STATUS_COLORS[key] || STATUS_COLORS.draft;
}
