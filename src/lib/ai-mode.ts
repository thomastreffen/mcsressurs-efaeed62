export type AiMode = "service" | "project" | "complex";

export interface AiModeConfig {
  label: string;
  description: string;
  className: string;
  maxSuggestions: number;
  maxQuestions: number;
  features: string[];
}

export const AI_MODE_CONFIG: Record<AiMode, AiModeConfig> = {
  service: {
    label: "Service",
    description: "Standardoppdrag med fokus på margin",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    maxSuggestions: 5,
    maxQuestions: 5,
    features: ["Standardposter", "Marginfokus"],
  },
  project: {
    label: "Prosjekt",
    description: "Strukturert kalkyleanalyse med forskriftskontroll",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    maxSuggestions: 15,
    maxQuestions: 10,
    features: ["Kalkyleanalyse", "Forskriftskontroll", "Risikoindikator", "Dokumentasjonskontroll"],
  },
  complex: {
    label: "Kompleks",
    description: "Dybdeanalyse med redundans- og selektivitetskontroll",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    maxSuggestions: 30,
    maxQuestions: 20,
    features: [
      "Dybdeanalyse",
      "Redundanssjekk",
      "Selektivitetskontroll",
      "Montasjerisiko",
      "Fremdriftsrisiko",
      "Anbefalt reserveprosent",
    ],
  },
};

export const ALL_AI_MODES: AiMode[] = ["service", "project", "complex"];

const COMPLEX_KEYWORDS = [
  "strømskinne", "ups", "generator", "datasenter", "data center",
  "nødstrøm", "redundans", "selektivitet", "høyspent", "transformator",
  "tavlebygg", "fordeling", "hovedfordeling",
];

/**
 * Auto-detect AI mode based on offer content.
 */
export function detectAiMode(opts: {
  description: string | null;
  itemCount: number;
  attachmentCount: number;
  itemTitles: string[];
}): AiMode {
  const text = [opts.description || "", ...opts.itemTitles].join(" ").toLowerCase();

  // Check for complex keywords
  const hasComplexKeyword = COMPLEX_KEYWORDS.some((kw) => text.includes(kw));

  // Check for high amperage mentions
  const ampMatch = text.match(/(\d+)\s*a\b/gi);
  const hasHighAmperage = ampMatch?.some((m) => {
    const num = parseInt(m);
    return num >= 250;
  });

  // Complex: keywords or high amperage or many lines + docs
  if (hasComplexKeyword || hasHighAmperage) return "complex";
  if (opts.itemCount > 30 && opts.attachmentCount >= 3) return "complex";

  // Project: moderate complexity
  if (opts.itemCount > 10 || opts.attachmentCount >= 2) return "project";

  return "service";
}
