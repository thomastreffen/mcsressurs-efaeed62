/**
 * Risk flag → category mapping.
 * Used by aggregateRisks to bucket flags.
 */

export type RiskCategory = "economic" | "legal" | "schedule" | "technical" | "documentation";

export const CATEGORY_LABELS: Record<RiskCategory, string> = {
  economic: "Økonomisk risiko",
  legal: "Juridisk risiko",
  schedule: "Fremdriftsrisiko",
  technical: "Teknisk risiko",
  documentation: "Dokumentasjonsrisiko",
};

const FLAG_CATEGORY: Record<string, RiskCategory> = {
  price_consequences_for_deviations: "economic",
  rigging_cost_not_included: "economic",
  crane_rental_not_included: "economic",
  power_supply_not_included: "economic",
  late_payment_risk: "economic",
  limitation_of_liability: "legal",

  liability_for_damages: "legal",
  liability_for_incomplete_information: "legal",
  subcontractor_liability: "legal",
  penalty_clause: "legal",
  insurance_requirement: "legal",
  dispute_resolution: "legal",
  termination_clause: "legal",
  force_majeure: "legal",

  storage_risk: "schedule",
  change_order_process: "schedule",

  unclarified_short_circuit_level_risk: "technical",

  warranty_period_risk: "documentation",
};

export function getCategoryForFlag(flag: string): RiskCategory {
  if (isComplianceText(flag)) return "documentation";
  return FLAG_CATEGORY[flag] || "documentation";
}

/* ── Severity mapping ── */

export type RiskSeverity = "low" | "medium" | "high";

const HIGH_FLAGS = new Set([
  "unclarified_short_circuit_level_risk",
  "short_circuit_level_missing",
  "price_consequences_for_deviations",
  "price_change_on_deviation",
  "missing_scope_items",
  "rigging_cost_not_included",
  "rigging_not_included",
  "crane_rental_not_included",
  "crane_not_included",
  "power_supply_not_included",
  "construction_power_not_included",
  "unclear_responsibility",
  "missing_technical_data",
]);

const MEDIUM_FLAGS = new Set([
  "late_payment_risk",
  "late_payment",
  "storage_risk",
  "storage_responsibility",
  "limitation_of_liability",
  "liability_limitations",
  "liability_for_damages",
  "liability_for_incomplete_information",
]);

const LOW_FLAGS = new Set([
  "ethics_compliance",
  "whistleblowing",
  "corruption_policy",
  "audit_cooperation",
]);

/**
 * Prefixes for Norwegian-language keys that indicate compliance/general
 * contract requirements rather than project-critical risks.
 */
const COMPLIANCE_TEXT_PREFIXES = [
  "Whistleblowing:",
  "Nulltoleranse",
  "Krav om",
  "Etterlevelsesrisiko:",
  "Manglende kjennskap",
  "Ansvar for underleverandører",
];

/**
 * Returns true when the flag looks like a Norwegian-language sentence key
 * (no underscores) that matches a known compliance prefix.
 */
export function isComplianceText(flag: string): boolean {
  if (flag.includes("_")) return false;
  return COMPLIANCE_TEXT_PREFIXES.some((p) => flag.startsWith(p));
}

export function getSeverityForFlag(flag: string): RiskSeverity {
  if (isComplianceText(flag)) return "low";
  if (HIGH_FLAGS.has(flag)) return "high";
  if (MEDIUM_FLAGS.has(flag)) return "medium";
  if (LOW_FLAGS.has(flag)) return "low";
  return "medium"; // default
}

/** Returns true if flag is a compliance/general requirement rather than project-critical */
export function isComplianceFlag(flag: string): boolean {
  return LOW_FLAGS.has(flag) || isComplianceText(flag);
}

/* ── Change order template mapping ── */

export interface ChangeOrderTemplate {
  title: string;
  description: string;
  reasonType: string;
}

const CHANGE_ORDER_TEMPLATES: Record<string, ChangeOrderTemplate> = {
  rigging_cost_not_included: {
    title: "Riggkostnad ikke inkludert",
    description: "Rigg og nedrigg er ikke inkludert i opprinnelig tilbud/kontrakt. Tillegg for riggkostnader.",
    reasonType: "scope_change",
  },
  power_supply_not_included: {
    title: "Byggestrøm ikke inkludert",
    description: "Byggestrøm / provisorisk strøm er ikke inkludert i opprinnelig tilbud/kontrakt.",
    reasonType: "scope_change",
  },
  crane_rental_not_included: {
    title: "Krankostnad ikke inkludert",
    description: "Kranleie er ikke inkludert i opprinnelig tilbud/kontrakt. Tillegg for krankostnader.",
    reasonType: "scope_change",
  },
  storage_risk: {
    title: "Lagring og mellomlagring",
    description: "Risiko knyttet til lagring av materiell og utstyr på byggeplass. Tillegg for lagringskostnader.",
    reasonType: "unforeseen",
  },
  price_consequences_for_deviations: {
    title: "Priskonsekvens ved avvik",
    description: "Avvik fra opprinnelig omfang medfører priskonsekvenser iht. kontraktsvilkår.",
    reasonType: "scope_change",
  },
};

const CHANGE_ORDER_ELIGIBLE = new Set(Object.keys(CHANGE_ORDER_TEMPLATES));

export function canGenerateChangeOrder(flag: string): boolean {
  return CHANGE_ORDER_ELIGIBLE.has(flag);
}

export function getChangeOrderTemplate(flag: string): ChangeOrderTemplate | null {
  return CHANGE_ORDER_TEMPLATES[flag] || null;
}
