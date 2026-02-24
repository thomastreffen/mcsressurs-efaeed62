/**
 * Centralized company pulse engine.
 * All scoring and prioritization logic lives here.
 */

// ── Pulse ──

export type PulseLevel = "stable" | "elevated" | "critical";

export interface PulseFactor {
  label: string;
  deduction: number;
}

export interface CompanyPulse {
  score: number; // 0-100
  level: PulseLevel;
  statusLabel: string;
  factors: PulseFactor[];
  explanation: string;
}

interface PulseInputs {
  overdueFollowups: number;
  highRiskProjects: number;
  calcsWithoutOffer: number;
  syncErrors: number;
  pipelineMomentumNegative: boolean;
  projectsWithoutPlan: number;
}

export function calculateCompanyPulse(inputs: PulseInputs): CompanyPulse {
  let score = 100;
  const factors: PulseFactor[] = [];

  if (inputs.overdueFollowups > 0) {
    const d = inputs.overdueFollowups * 15;
    score -= d;
    factors.push({ label: `${inputs.overdueFollowups} forfalte oppfølginger`, deduction: d });
  }
  if (inputs.highRiskProjects > 0) {
    score -= 20;
    factors.push({ label: `${inputs.highRiskProjects} high-risk prosjekt${inputs.highRiskProjects > 1 ? "er" : ""}`, deduction: 20 });
  }
  if (inputs.calcsWithoutOffer > 0) {
    const d = inputs.calcsWithoutOffer * 10;
    score -= d;
    factors.push({ label: `${inputs.calcsWithoutOffer} kalkyle${inputs.calcsWithoutOffer > 1 ? "r" : ""} uten tilbud`, deduction: d });
  }
  if (inputs.syncErrors > 0) {
    score -= 15;
    factors.push({ label: "Synkroniseringsfeil", deduction: 15 });
  }
  if (inputs.pipelineMomentumNegative) {
    score -= 10;
    factors.push({ label: "Negativ pipeline-momentum", deduction: 10 });
  }
  if (inputs.projectsWithoutPlan > 0) {
    const d = inputs.projectsWithoutPlan * 5;
    score -= d;
    factors.push({ label: `${inputs.projectsWithoutPlan} prosjekt${inputs.projectsWithoutPlan > 1 ? "er" : ""} uten godkjent plan`, deduction: d });
  }

  score = Math.max(0, Math.min(100, score));
  factors.sort((a, b) => b.deduction - a.deduction);

  const level: PulseLevel = score >= 80 ? "stable" : score >= 60 ? "elevated" : "critical";
  const statusLabel = level === "stable" ? "Stabil drift" : level === "elevated" ? "Økt trykk" : "Krever fokus";

  const topFactors = factors.slice(0, 2);
  const explanation = topFactors.length === 0
    ? "Alt ser bra ut. Ingen kritiske saker."
    : topFactors.map(f => f.label).join(" og ") + " krever oppmerksomhet.";

  return { score, level, statusLabel, factors, explanation };
}

// ── Action priority ──

export interface ActionPriorityInputs {
  urgency: "overdue" | "today" | "this_week";
  isHighRisk?: boolean;
  isSyncError?: boolean;
  isCalcWithoutOfferOld?: boolean; // > 3 days
  isInactiveLead?: boolean; // > 7 days
  isProjectWithoutPlan?: boolean;
}

export function calculateActionPriority(inputs: ActionPriorityInputs): number {
  let score = 0;

  // Urgency base
  if (inputs.urgency === "overdue") score += 50;
  else if (inputs.urgency === "today") score += 30;
  else score += 10;

  // Modifiers
  if (inputs.isHighRisk) score += 40;
  if (inputs.isSyncError) score += 35;
  if (inputs.isCalcWithoutOfferOld) score += 25;
  if (inputs.isInactiveLead) score += 20;
  if (inputs.isProjectWithoutPlan) score += 15;

  return score;
}

// ── Project health micro-text ──

export interface ProjectHealthMicro {
  econ: string;
  risk: string;
  cashflow: string;
}

export function getProjectHealthMicro(inputs: {
  budgetOverCount: number;
  highRiskCount: number;
  mediumRiskCount: number;
  overdueInvoices: number;
  oldestInvoiceDays: number;
}): ProjectHealthMicro {
  return {
    econ: inputs.budgetOverCount === 0
      ? "0 budsjettavvik"
      : `${inputs.budgetOverCount} prosjekt${inputs.budgetOverCount > 1 ? "er" : ""} over 10 %`,
    risk: inputs.highRiskCount === 0 && inputs.mediumRiskCount === 0
      ? "Ingen åpne risikoer"
      : `${inputs.highRiskCount} high, ${inputs.mediumRiskCount} medium`,
    cashflow: inputs.overdueInvoices === 0
      ? "0 forfalte fakturaer"
      : `${inputs.overdueInvoices} faktura${inputs.overdueInvoices > 1 ? "er" : ""} > ${inputs.oldestInvoiceDays} dager`,
  };
}
