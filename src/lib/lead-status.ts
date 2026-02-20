export type LeadStatus = "new" | "contacted" | "befaring" | "qualified" | "tilbud_sendt" | "forhandling" | "won" | "lost";

export interface LeadStatusConfig {
  label: string;
  className: string;
}

export const LEAD_STATUS_CONFIG: Record<LeadStatus, LeadStatusConfig> = {
  new: { label: "Ny", className: "bg-primary/15 text-primary border border-primary/20" },
  contacted: { label: "Kontaktet", className: "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800" },
  befaring: { label: "Befaring", className: "bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800" },
  qualified: { label: "Kvalifisert", className: "bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800" },
  tilbud_sendt: { label: "Tilbud sendt", className: "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800" },
  forhandling: { label: "Forhandling", className: "bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800" },
  won: { label: "Vunnet", className: "bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800" },
  lost: { label: "Tapt", className: "bg-destructive/10 text-destructive border border-destructive/20" },
};

export const ALL_LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "befaring", "qualified", "tilbud_sendt", "forhandling", "won", "lost"];

export const NEXT_ACTION_TYPES = [
  { key: "call", label: "Telefon" },
  { key: "email", label: "E-post" },
  { key: "meeting", label: "Møte" },
  { key: "site_visit", label: "Befaring" },
  { key: "other", label: "Annet" },
] as const;

export type PipelineStage = "new" | "contacted" | "befaring" | "qualified" | "calculation" | "tilbud_sendt" | "forhandling" | "negotiation" | "offer_sent" | "won" | "lost";

export const PIPELINE_STAGES: { key: PipelineStage; label: string; color: string }[] = [
  { key: "new", label: "Nye leads", color: "hsl(213, 60%, 42%)" },
  { key: "contacted", label: "Kontaktet", color: "hsl(40, 85%, 50%)" },
  { key: "befaring", label: "Befaring", color: "hsl(185, 60%, 40%)" },
  { key: "qualified", label: "Kvalifisert", color: "hsl(262, 55%, 55%)" },
  { key: "calculation", label: "Kalkyle pågår", color: "hsl(45, 85%, 50%)" },
  { key: "tilbud_sendt", label: "Tilbud sendt", color: "hsl(210, 60%, 50%)" },
  { key: "offer_sent", label: "Tilbud sendt (legacy)", color: "hsl(210, 60%, 50%)" },
  { key: "forhandling", label: "Forhandling", color: "hsl(28, 80%, 52%)" },
  { key: "negotiation", label: "Forhandling (legacy)", color: "hsl(28, 80%, 52%)" },
  { key: "won", label: "Vunnet", color: "hsl(152, 60%, 42%)" },
  { key: "lost", label: "Tapt", color: "hsl(0, 72%, 51%)" },
];
