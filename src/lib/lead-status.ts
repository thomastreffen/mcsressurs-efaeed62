export type LeadStatus = "new" | "contacted" | "befaring" | "qualified" | "tilbud_sendt" | "forhandling" | "won" | "lost";

export interface LeadStatusConfig {
  label: string;
  className: string;
}

// B2B tavlebygger / strømskinne-kontekst — kunder er elektroinstallatører
export const LEAD_STATUS_CONFIG: Record<LeadStatus, LeadStatusConfig> = {
  new: { label: "Ny henvendelse", className: "bg-primary/15 text-primary border border-primary/20" },
  contacted: { label: "Kontakt etablert", className: "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800" },
  befaring: { label: "Befaring / kartlegging", className: "bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800" },
  qualified: { label: "Spesifikasjon bekreftet", className: "bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800" },
  tilbud_sendt: { label: "Tilbud sendt", className: "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800" },
  forhandling: { label: "Avklaring / forhandling", className: "bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800" },
  won: { label: "Bestilling mottatt", className: "bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800" },
  lost: { label: "Tapt", className: "bg-destructive/10 text-destructive border border-destructive/20" },
};

export const ALL_LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "befaring", "qualified", "tilbud_sendt", "forhandling", "won", "lost"];

export const NEXT_ACTION_TYPES = [
  { key: "call", label: "Ring kunde" },
  { key: "email", label: "Send e-post" },
  { key: "meeting", label: "Avtal befaring" },
  { key: "site_visit", label: "Gjennomfør befaring" },
  { key: "send_offer", label: "Send tilbud" },
  { key: "follow_up_offer", label: "Purre tilbud" },
  { key: "clarify_tech", label: "Avklare teknisk spesifikasjon" },
  { key: "clarify_date", label: "Avklare leveringsdato" },
  { key: "await_order", label: "Vent på bestilling" },
  { key: "other", label: "Annet" },
] as const;

// Pipeline stages map directly to lead statuses — single entity flow
export type PipelineStage = LeadStatus;

export const PIPELINE_STAGES: { key: PipelineStage; label: string; color: string }[] = [
  { key: "new", label: "Ny henvendelse", color: "hsl(213, 60%, 42%)" },
  { key: "contacted", label: "Kontakt etablert", color: "hsl(40, 85%, 50%)" },
  { key: "befaring", label: "Befaring", color: "hsl(185, 60%, 40%)" },
  { key: "qualified", label: "Spesifikasjon bekreftet", color: "hsl(262, 55%, 55%)" },
  { key: "tilbud_sendt", label: "Tilbud sendt", color: "hsl(210, 60%, 50%)" },
  { key: "forhandling", label: "Avklaring", color: "hsl(28, 80%, 52%)" },
  { key: "won", label: "Bestilling mottatt", color: "hsl(152, 60%, 42%)" },
  { key: "lost", label: "Tapt", color: "hsl(0, 72%, 51%)" },
];
