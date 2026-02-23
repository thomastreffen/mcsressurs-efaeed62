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
