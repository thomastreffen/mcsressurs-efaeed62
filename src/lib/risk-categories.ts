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
  limitation_of_liability: "economic",

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
]);

const LOW_FLAGS = new Set([
  "ethics_compliance",
  "whistleblowing",
  "corruption_policy",
  "audit_cooperation",
]);

export function getSeverityForFlag(flag: string): RiskSeverity {
  if (HIGH_FLAGS.has(flag)) return "high";
  if (MEDIUM_FLAGS.has(flag)) return "medium";
  if (LOW_FLAGS.has(flag)) return "low";
  return "medium"; // default
}

/** Returns true if flag is a compliance/general requirement rather than project-critical */
export function isComplianceFlag(flag: string): boolean {
  return LOW_FLAGS.has(flag);
}
