export type LeadStatus = "new" | "contacted" | "qualified" | "lost" | "won";

export interface LeadStatusConfig {
  label: string;
  className: string;
  pipelineColumn?: string;
}

export const LEAD_STATUS_CONFIG: Record<LeadStatus, LeadStatusConfig> = {
  new: { label: "Ny", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  contacted: { label: "Kontaktet", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  qualified: { label: "Kvalifisert", className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  lost: { label: "Tapt", className: "bg-destructive/15 text-destructive" },
  won: { label: "Vunnet", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
};

export const ALL_LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "lost", "won"];

// Pipeline columns map lead status + calculation/offer status to pipeline stages
export type PipelineStage = "new" | "qualified" | "calculation" | "offer_sent" | "negotiation" | "won" | "lost";

export const PIPELINE_STAGES: { key: PipelineStage; label: string; color: string }[] = [
  { key: "new", label: "Nye leads", color: "hsl(213, 60%, 42%)" },
  { key: "qualified", label: "Kvalifisert", color: "hsl(262, 55%, 55%)" },
  { key: "calculation", label: "Kalkyle pågår", color: "hsl(40, 85%, 50%)" },
  { key: "offer_sent", label: "Tilbud sendt", color: "hsl(185, 60%, 40%)" },
  { key: "negotiation", label: "Forhandling", color: "hsl(28, 80%, 52%)" },
  { key: "won", label: "Vunnet", color: "hsl(152, 60%, 42%)" },
  { key: "lost", label: "Tapt", color: "hsl(0, 72%, 51%)" },
];
