import { Badge } from "@/components/ui/badge";
import { TrendingUp, ShieldAlert, CheckCircle2, Banknote } from "lucide-react";
import type { AiMode } from "@/lib/ai-mode";

interface ExecutiveSummaryProps {
  totalPrice: number;
  totalMaterial: number;
  totalLabor: number;
  totalCost: number;
  marginPercent: number;
  totalMargin: number;
  aiMode: AiMode;
  itemCount: number;
  hasCustomerEmail: boolean;
  attachmentCount: number;
  missingInfoCount: number;
  unansweredQuestions: number;
  calcChangedSinceOffer: boolean;
  status: string;
}

type Score = "good" | "warning" | "critical";

const SCORE_STYLES: Record<Score, string> = {
  good: "text-green-700 dark:text-green-400",
  warning: "text-orange-700 dark:text-orange-400",
  critical: "text-red-700 dark:text-red-400",
};

const SCORE_BG: Record<Score, string> = {
  good: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
  warning: "bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800",
  critical: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
};

const SCORE_BADGE: Record<Score, string> = {
  good: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  warning: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function getMarginScore(dg: number): Score {
  if (dg >= 18) return "good";
  if (dg >= 10) return "warning";
  return "critical";
}

function getRiskScore(aiMode: AiMode, missingInfoCount: number, hasEmail: boolean, itemCount: number, attachmentCount: number): { score: Score; factors: string[] } {
  const factors: string[] = [];
  let level: Score = aiMode === "service" ? "good" : "warning";

  if (aiMode === "complex") level = "warning";

  if (missingInfoCount > 5) {
    level = "critical";
    factors.push(`${missingInfoCount} manglende felter fra AI`);
  } else if (missingInfoCount > 2) {
    if (level === "good") level = "warning";
    factors.push(`${missingInfoCount} manglende felter`);
  }

  if (!hasEmail) {
    factors.push("Mangler kunde-epost");
    if (level === "good") level = "warning";
  }

  if (itemCount === 0) {
    factors.push("Ingen kalkylelinjer");
    level = "critical";
  }

  if (aiMode === "complex" && attachmentCount === 0) {
    factors.push("Ingen dokumenter (kompleks)");
    if (level !== "critical") level = "warning";
  }

  return { score: level, factors };
}

function getMaturityPercent(opts: {
  itemCount: number;
  unansweredQuestions: number;
  calcChangedSinceOffer: boolean;
  hasEmail: boolean;
  status: string;
}): number {
  let pct = 100;
  if (opts.itemCount === 0) pct -= 30;
  if (opts.unansweredQuestions > 0) pct -= Math.min(opts.unansweredQuestions * 5, 20);
  if (opts.calcChangedSinceOffer) pct -= 15;
  if (!opts.hasEmail) pct -= 10;
  return Math.max(0, pct);
}

export function ExecutiveSummary(props: ExecutiveSummaryProps) {
  const marginScore = getMarginScore(props.marginPercent);
  const risk = getRiskScore(props.aiMode, props.missingInfoCount, props.hasCustomerEmail, props.itemCount, props.attachmentCount);
  const maturity = getMaturityPercent({
    itemCount: props.itemCount,
    unansweredQuestions: props.unansweredQuestions,
    calcChangedSinceOffer: props.calcChangedSinceOffer,
    hasEmail: props.hasCustomerEmail,
    status: props.status,
  });
  const maturityScore: Score = maturity >= 80 ? "good" : maturity >= 50 ? "warning" : "critical";

  const materialShare = props.totalPrice > 0 ? (props.totalMaterial / props.totalPrice) * 100 : 0;
  const cashflowScore: Score = materialShare > 80 ? "critical" : materialShare > 60 ? "warning" : "good";

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lederoversikt</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {/* Margin */}
        <div className={`rounded-xl border p-3 space-y-1.5 ${SCORE_BG[marginScore]}`}>
          <div className="flex items-center gap-1.5">
            <TrendingUp className={`h-3.5 w-3.5 ${SCORE_STYLES[marginScore]}`} />
            <span className="text-xs font-medium">Margin</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-lg font-bold font-mono ${SCORE_STYLES[marginScore]}`}>
              {props.marginPercent.toFixed(1)}%
            </span>
            <Badge className={`${SCORE_BADGE[marginScore]} text-[9px] px-1.5 py-0`}>
              {marginScore === "good" ? "God" : marginScore === "warning" ? "Lav" : "Kritisk"}
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground font-mono">
            DB kr {props.totalMargin.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
          </p>
        </div>

        {/* Risk */}
        <div className={`rounded-xl border p-3 space-y-1.5 ${SCORE_BG[risk.score]}`}>
          <div className="flex items-center gap-1.5">
            <ShieldAlert className={`h-3.5 w-3.5 ${SCORE_STYLES[risk.score]}`} />
            <span className="text-xs font-medium">Risiko</span>
          </div>
          <Badge className={`${SCORE_BADGE[risk.score]} text-[10px]`}>
            {risk.score === "good" ? "Lav" : risk.score === "warning" ? "Middels" : "Høy"}
          </Badge>
          {risk.factors.length > 0 && (
            <ul className="space-y-0.5">
              {risk.factors.slice(0, 3).map((f, i) => (
                <li key={i} className="text-[10px] text-muted-foreground">• {f}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Maturity */}
        <div className={`rounded-xl border p-3 space-y-1.5 ${SCORE_BG[maturityScore]}`}>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className={`h-3.5 w-3.5 ${SCORE_STYLES[maturityScore]}`} />
            <span className="text-xs font-medium">Modenhet</span>
          </div>
          <span className={`text-lg font-bold font-mono ${SCORE_STYLES[maturityScore]}`}>
            {maturity}%
          </span>
          <p className="text-[10px] text-muted-foreground">
            {maturity >= 80 ? "Klar til å sende" : maturity >= 50 ? "Trenger arbeid" : "Ikke klar"}
          </p>
        </div>

        {/* Cashflow */}
        <div className={`rounded-xl border p-3 space-y-1.5 ${SCORE_BG[cashflowScore]}`}>
          <div className="flex items-center gap-1.5">
            <Banknote className={`h-3.5 w-3.5 ${SCORE_STYLES[cashflowScore]}`} />
            <span className="text-xs font-medium">Kontantstrøm</span>
          </div>
          <span className={`text-sm font-bold font-mono ${SCORE_STYLES[cashflowScore]}`}>
            {materialShare.toFixed(0)}% materiell
          </span>
          <p className="text-[10px] text-muted-foreground">
            {materialShare > 80 ? "⚠ Vurder forskudd/a-konto" : materialShare > 60 ? "Vurder forskudd" : "Balansert"}
          </p>
        </div>
      </div>
    </div>
  );
}
