export type CaseStatus = "new" | "triage" | "assigned" | "waiting_customer" | "waiting_internal" | "converted" | "closed" | "archived";
export type CasePriority = "low" | "normal" | "high" | "critical";
export type CaseNextAction = "call" | "quote" | "clarify" | "order" | "schedule" | "document" | "none";
export type CaseScope = "company" | "department" | "project" | "private";

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  new: "Ny",
  triage: "Sortering",
  assigned: "Tildelt",
  waiting_customer: "Avventer kunde",
  waiting_internal: "Avventer internt",
  converted: "Opprettet jobb",
  closed: "Lukket",
  archived: "Arkivert",
};

export const CASE_STATUS_COLOR: Record<CaseStatus, string> = {
  new: "bg-primary/10 text-primary",
  triage: "bg-amber-500/10 text-amber-600",
  assigned: "bg-blue-500/10 text-blue-600",
  waiting_customer: "bg-orange-500/10 text-orange-600",
  waiting_internal: "bg-purple-500/10 text-purple-600",
  converted: "bg-emerald-500/10 text-emerald-600",
  closed: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

export const CASE_PRIORITY_LABELS: Record<CasePriority, string> = {
  low: "Lav",
  normal: "Normal",
  high: "Høy",
  critical: "Kritisk",
};

export const CASE_PRIORITY_COLOR: Record<CasePriority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-blue-500/10 text-blue-600",
  high: "bg-orange-500/10 text-orange-600",
  critical: "bg-destructive/10 text-destructive",
};

export const CASE_NEXT_ACTION_LABELS: Record<CaseNextAction, string> = {
  call: "Ring kunde",
  quote: "Lag tilbud",
  clarify: "Avklar teknisk",
  order: "Bestill materiell",
  schedule: "Planlegg jobb",
  document: "Dokumenter",
  none: "Ingen satt",
};

export const CASE_SCOPE_LABELS: Record<CaseScope, string> = {
  company: "Hele firma",
  department: "Avdeling",
  project: "Prosjekt",
  private: "Privat",
};

export const ALL_CASE_STATUSES: CaseStatus[] = ["new", "triage", "assigned", "waiting_customer", "waiting_internal", "converted", "closed", "archived"];
export const ALL_CASE_PRIORITIES: CasePriority[] = ["low", "normal", "high", "critical"];
export const ALL_CASE_NEXT_ACTIONS: CaseNextAction[] = ["call", "quote", "clarify", "order", "schedule", "document", "none"];
