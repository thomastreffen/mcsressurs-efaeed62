export type OfferStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "signed" | "archived";

export interface OfferStatusConfig {
  label: string;
  className: string;
}

export const OFFER_STATUS_CONFIG: Record<OfferStatus, OfferStatusConfig> = {
  draft: { label: "Utkast", className: "bg-muted text-muted-foreground" },
  sent: { label: "Sendt", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  accepted: { label: "Akseptert", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  rejected: { label: "Avslått", className: "bg-destructive/15 text-destructive" },
  expired: { label: "Utløpt", className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  signed: { label: "Signert", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  archived: { label: "Arkivert", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

export const ALL_OFFER_STATUSES: OfferStatus[] = ["draft", "sent", "accepted", "rejected", "expired", "signed", "archived"];
