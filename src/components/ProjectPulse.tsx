import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canGenerateChangeOrder } from "@/lib/risk-categories";
import {
  TrendingUp,
  ShieldAlert,
  FilePlus2,
  Wallet,
} from "lucide-react";

/* ── Types ── */
interface PulseProps {
  jobId: string;
}

type StatusColor = "green" | "yellow" | "red";

interface PulseCard {
  title: string;
  icon: React.ReactNode;
  status: StatusColor;
  mainValue: string;
  mainLabel: string;
  secondaryValue: string;
  secondaryLabel: string;
  hint: string;
}

/* ── Status dot ── */
const STATUS_DOT: Record<StatusColor, string> = {
  green: "bg-success",
  yellow: "bg-[hsl(var(--accent))]",
  red: "bg-destructive",
};

const STATUS_RING: Record<StatusColor, string> = {
  green: "ring-success/20",
  yellow: "ring-[hsl(var(--accent))]/20",
  red: "ring-destructive/20",
};

function StatusIndicator({ color }: { color: StatusColor }) {
  return (
    <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[color]} ring-4 ${STATUS_RING[color]}`} />
  );
}

/* ── Format helpers ── */
function fmtNOK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
  return n.toLocaleString("nb-NO");
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

/* ── Main component ── */
export function ProjectPulse({ jobId }: PulseProps) {
  const [cards, setCards] = useState<PulseCard[] | null>(null);

  const fetchData = useCallback(async () => {
    // Parallel fetch all data we need
    const [summaryRes, cosRes, risksRes, analysesRes] = await Promise.all([
      supabase.from("job_summaries").select("key_numbers").eq("job_id", jobId).maybeSingle(),
      supabase.from("job_change_orders").select("status, amount_ex_vat, linked_risk_id").eq("job_id", jobId),
      supabase.from("job_risk_items").select("severity, status, category, label").eq("job_id", jobId),
      supabase.from("document_analyses").select("parsed_fields, analysis_type").eq("job_id", jobId).eq("analysis_type", "offer").order("created_at", { ascending: false }).limit(1),
    ]);

    const kn = (summaryRes.data?.key_numbers as any) || {};
    const cos = cosRes.data || [];
    const risks = risksRes.data || [];

    // Base value from job_summaries or offer analysis
    let baseValue = kn.total_amount != null ? Number(kn.total_amount) : 0;
    const currency = kn.currency || "NOK";
    const paymentTerms = kn.payment_terms || null;

    if (baseValue === 0 && analysesRes.data?.length) {
      const pf = (analysesRes.data[0].parsed_fields as any) || {};
      if (pf.total_amount != null) baseValue = Number(pf.total_amount);
    }

    // ── Change order aggregates ──
    const approvedSum = cos.filter(c => c.status === "approved" || c.status === "invoiced").reduce((s, c) => s + Number(c.amount_ex_vat || 0), 0);
    const pendingCOs = cos.filter(c => c.status === "sent" || c.status === "pending");
    const pendingSum = pendingCOs.reduce((s, c) => s + Number(c.amount_ex_vat || 0), 0);
    const draftCount = cos.filter(c => c.status === "draft").length;
    const sentAndApprovedCount = cos.filter(c => ["sent", "approved", "invoiced"].includes(c.status)).length;

    const totalNow = baseValue + approvedSum;

    // ── ØKONOMI ──
    const pendingPct = baseValue > 0 ? pendingSum / baseValue : 0;
    let econStatus: StatusColor = "green";
    if (pendingPct > 0.15) econStatus = "red";
    else if (pendingPct >= 0.05) econStatus = "yellow";

    // ── RISIKO ──
    // Filter out compliance/documentation for scoring
    const projectRisks = risks.filter(r =>
      (r.status === "open" || r.status === "acknowledged") &&
      r.severity !== "low" && r.category !== "documentation"
    );
    let riskScore = 0;
    let highOpenCount = 0;
    for (const r of projectRisks) {
      if (r.severity === "high") { riskScore += 2; highOpenCount++; }
      else if (r.severity === "medium") riskScore += 1;
    }
    let riskStatus: StatusColor = "green";
    if (riskScore >= 9 || highOpenCount >= 3) riskStatus = "red";
    else if (riskScore >= 4 || highOpenCount >= 2) riskStatus = "yellow";

    // ── TILLEGG ──
    // Count risks that can generate change orders
    const openRisks = risks.filter(r => r.status === "open" || r.status === "acknowledged");
    // We need raw_key which isn't stored in DB, so estimate from known eligible count
    // Use a simpler approach: count risks in categories that map to CO-eligible flags
    const coEligibleCategories = new Set(["economic", "schedule"]);
    const identifiedPotential = Math.max(
      openRisks.filter(r => coEligibleCategories.has(r.category) && r.severity !== "low").length,
      sentAndApprovedCount
    );
    const ratio = identifiedPotential > 0 ? sentAndApprovedCount / identifiedPotential : 1;
    let tilleggStatus: StatusColor = "green";
    if (ratio < 0.70) tilleggStatus = "red";
    else if (ratio < 0.90) tilleggStatus = "yellow";

    // ── CASHFLOW ──
    const outstanding = pendingSum;
    const outstandingPct = totalNow > 0 ? outstanding / totalNow : 0;
    const hasLatePaymentRisk = risks.some(r =>
      (r.status === "open" || r.status === "acknowledged") &&
      r.category !== "documentation" &&
      r.label.toLowerCase().includes("betalingsrisiko")
    );
    let cashStatus: StatusColor = "green";
    if (outstandingPct > 0.35) cashStatus = "red";
    else if (outstandingPct >= 0.20 || hasLatePaymentRisk) cashStatus = "yellow";
    if (hasLatePaymentRisk && cashStatus === "green") cashStatus = "yellow";

    setCards([
      {
        title: "Økonomi",
        icon: <TrendingUp className="h-4 w-4" />,
        status: econStatus,
        mainValue: `${currency} ${fmtNOK(totalNow)}`,
        mainLabel: "Total nå",
        secondaryValue: pendingSum > 0 ? `${currency} ${fmtNOK(pendingSum)} (${fmtPct(pendingPct)})` : "Ingen",
        secondaryLabel: "Avventende",
        hint: pendingPct > 0.05 ? "Uavklarte tillegg påvirker margin" : "Økonomi under kontroll",
      },
      {
        title: "Risiko",
        icon: <ShieldAlert className="h-4 w-4" />,
        status: riskStatus,
        mainValue: String(riskScore),
        mainLabel: "Risikopoeng",
        secondaryValue: `${highOpenCount} HIGH åpne`,
        secondaryLabel: "Prosjektkritiske",
        hint: "Økonomi / teknikk / fremdrift",
      },
      {
        title: "Tillegg",
        icon: <FilePlus2 className="h-4 w-4" />,
        status: tilleggStatus,
        mainValue: `${sentAndApprovedCount}/${identifiedPotential || "—"}`,
        mainLabel: "Sendt / identifisert",
        secondaryValue: draftCount > 0 ? `${draftCount} utkast` : "Ingen utkast",
        secondaryLabel: "Under arbeid",
        hint: "Identifisert vs sendt",
      },
      {
        title: "Cashflow",
        icon: <Wallet className="h-4 w-4" />,
        status: cashStatus,
        mainValue: `${currency} ${fmtNOK(outstanding)}`,
        mainLabel: "Utestående",
        secondaryValue: paymentTerms || "—",
        secondaryLabel: "Betalingsvilkår",
        hint: "Likviditetseksponering",
      },
    ]);
  }, [jobId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!cards) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.title}
          className="rounded-2xl border border-border/60 bg-card shadow-sm p-4 flex flex-col justify-between min-h-[120px]"
        >
          {/* Top row: title + status dot */}
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {card.icon}
              {card.title}
            </span>
            <StatusIndicator color={card.status} />
          </div>

          {/* Main value */}
          <p className="text-xl sm:text-2xl font-bold text-foreground font-mono leading-tight truncate">
            {card.mainValue}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{card.mainLabel}</p>

          {/* Secondary */}
          <div className="mt-2 pt-2 border-t border-border/40">
            <p className="text-xs font-medium text-foreground truncate">{card.secondaryValue}</p>
            <p className="text-[10px] text-muted-foreground">{card.secondaryLabel}</p>
          </div>

          {/* Hint */}
          <p className="text-[10px] text-muted-foreground/70 mt-1.5 leading-tight">{card.hint}</p>
        </div>
      ))}
    </div>
  );
}
