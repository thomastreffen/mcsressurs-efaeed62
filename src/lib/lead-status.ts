export type LeadStatus = "new" | "contacted" | "qualified" | "lost" | "won";

export interface LeadStatusConfig {
  label: string;
  className: string;
  pipelineColumn?: string;
}

export const LEAD_STATUS_CONFIG: Record<LeadStatus, LeadStatusConfig> = {
  new: { label: "Ny", className: "bg-primary/15 text-primary border border-primary/20" },
  contacted: { label: "Kontaktet", className: "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800" },
  qualified: { label: "Kvalifisert", className: "bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800" },
  lost: { label: "Tapt", className: "bg-destructive/10 text-destructive border border-destructive/20" },
  won: { label: "Vunnet", className: "bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800" },
};

export const ALL_LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "lost", "won"];

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
