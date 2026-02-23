/**
 * Maps snake_case risk flags from AI analysis to readable Norwegian descriptions.
 */
const RISK_FLAG_MAP: Record<string, string> = {
  price_consequences_for_deviations: "Prisendringer ved avvik. Kan gi ekstra kostnader",
  liability_for_damages: "Ansvar ved skader. Sjekk ansvarsfordeling",
  storage_risk: "Lagring og mellomlagring. Avklar ansvar og kostnad",
  rigging_cost_not_included: "Rigging ikke inkludert. Kan komme i tillegg",
  crane_rental_not_included: "Kranleie ikke inkludert. Kan komme i tillegg",
  power_supply_not_included: "Byggestrøm ikke inkludert. Avklar entreprenør",
  unclarified_short_circuit_level_risk: "Kortslutningsnivå ikke avklart. Risiko for feil dimensjonering",
  liability_for_incomplete_information: "Ansvar ved mangelfull info. Risiko for tillegg",
  late_payment_risk: "Sen betaling. Vurder sikkerhet eller forskudd",
  limitation_of_liability: "Ansvarsbegrensning. Sjekk beløpsgrenser",
  warranty_period_risk: "Garantiperiode. Sjekk varighet og betingelser",
  penalty_clause: "Dagmulkt. Sjekk beløp og betingelser",
  insurance_requirement: "Forsikringskrav. Sjekk dekning",
  subcontractor_liability: "Underentreprenøransvar. Sjekk vilkår",
  force_majeure: "Force majeure. Sjekk definisjoner og konsekvenser",
  change_order_process: "Endringshåndtering. Avklar prosess og prising",
  dispute_resolution: "Tvisteløsning. Sjekk mekanisme og verneting",
  termination_clause: "Oppsigelsesklausul. Sjekk vilkår og konsekvenser",
};

/**
 * Converts a snake_case key to a readable string as fallback.
 * e.g. "some_unknown_flag" -> "Some unknown flag"
 */
function humanize(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Returns a Norwegian label for a risk flag key.
 * Falls back to humanized version if not in mapping.
 */
export function getRiskFlagLabel(flag: string): string {
  return RISK_FLAG_MAP[flag] || humanize(flag);
}
