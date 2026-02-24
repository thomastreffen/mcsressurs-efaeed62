import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  TrendingUp,
  ShieldAlert,
  FilePlus2,
  Wallet,
} from "lucide-react";

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
  secondary: string;
  warning?: string; // only shown when yellow/red
}

/* ── Accent left border per status ── */
const BORDER_LEFT: Record<StatusColor, string> = {
  green: "border-l-success/40",
  yellow: "border-l-[hsl(var(--accent))]/60",
  red: "border-l-destructive/50",
};

function fmtNOK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
  return n.toLocaleString("nb-NO");
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)} %`;
}

export function ProjectPulse({ jobId }: PulseProps) {
  const [cards, setCards] = useState<PulseCard[] | null>(null);

  const fetchData = useCallback(async () => {
    const [summaryRes, cosRes, risksRes, analysesRes] = await Promise.all([
      supabase.from("job_summaries").select("key_numbers").eq("job_id", jobId).maybeSingle(),
      supabase.from("job_change_orders").select("status, amount_ex_vat, linked_risk_id").eq("job_id", jobId),
      supabase.from("job_risk_items").select("severity, status, category, label").eq("job_id", jobId),
      supabase.from("document_analyses").select("parsed_fields, analysis_type").eq("job_id", jobId).eq("analysis_type", "offer").order("created_at", { ascending: false }).limit(1),
    ]);

    const kn = (summaryRes.data?.key_numbers as any) || {};
    const cos = cosRes.data || [];
    const risks = risksRes.data || [];

    let baseValue = kn.total_amount != null ? Number(kn.total_amount) : 0;
    const currency = kn.currency || "NOK";
    const paymentTerms: string | null = kn.payment_terms || null;

    if (baseValue === 0 && analysesRes.data?.length) {
      const pf = (analysesRes.data[0].parsed_fields as any) || {};
      if (pf.total_amount != null) baseValue = Number(pf.total_amount);
    }

    const approvedSum = cos.filter(c => c.status === "approved" || c.status === "invoiced").reduce((s, c) => s + Number(c.amount_ex_vat || 0), 0);
    const pendingCOs = cos.filter(c => c.status === "sent" || c.status === "pending");
    const pendingSum = pendingCOs.reduce((s, c) => s + Number(c.amount_ex_vat || 0), 0);
    const draftCount = cos.filter(c => c.status === "draft").length;
    const sentApproved = cos.filter(c => ["sent", "approved", "invoiced"].includes(c.status)).length;
    const totalNow = baseValue + approvedSum;

    // ── ØKONOMI ──
    const pendingPct = baseValue > 0 ? pendingSum / baseValue : 0;
    let econStatus: StatusColor = "green";
    if (pendingPct > 0.15) econStatus = "red";
    else if (pendingPct >= 0.05) econStatus = "yellow";

    // ── RISIKO ──
    const projectRisks = risks.filter(r =>
      (r.status === "open" || r.status === "acknowledged") &&
      r.severity !== "low" && r.category !== "documentation"
    );
    let riskScore = 0;
    let highOpen = 0;
    for (const r of projectRisks) {
      if (r.severity === "high") { riskScore += 2; highOpen++; }
      else if (r.severity === "medium") riskScore += 1;
    }
    let riskStatus: StatusColor = "green";
    if (riskScore >= 9 || highOpen >= 3) riskStatus = "red";
    else if (riskScore >= 4 || highOpen >= 2) riskStatus = "yellow";

    // ── TILLEGG ──
    const coEligible = new Set(["economic", "schedule"]);
    const openEligible = risks.filter(r => (r.status === "open" || r.status === "acknowledged") && coEligible.has(r.category) && r.severity !== "low").length;
    const identified = Math.max(openEligible, sentApproved);
    const ratio = identified > 0 ? sentApproved / identified : 1;
    let tilleggStatus: StatusColor = "green";
    if (ratio < 0.70) tilleggStatus = "red";
    else if (ratio < 0.90) tilleggStatus = "yellow";

    // ── CASHFLOW ──
    const outstanding = pendingSum;
    const outPct = totalNow > 0 ? outstanding / totalNow : 0;
    const hasLateRisk = risks.some(r =>
      (r.status === "open" || r.status === "acknowledged") &&
      r.category !== "documentation" &&
      r.label.toLowerCase().includes("betalingsrisiko")
    );
    let cashStatus: StatusColor = "green";
    if (outPct > 0.35) cashStatus = "red";
    else if (outPct >= 0.20 || hasLateRisk) cashStatus = "yellow";
    if (hasLateRisk && cashStatus === "green") cashStatus = "yellow";

    setCards([
      {
        title: "Økonomi",
        icon: <TrendingUp className="h-3.5 w-3.5" />,
        status: econStatus,
        mainValue: baseValue > 0 ? `${currency} ${fmtNOK(totalNow)}` : "—",
        mainLabel: "Total nå",
        secondary: `${fmtPct(pendingPct)} eksponering` + (pendingSum > 0 ? ` · ${currency} ${fmtNOK(pendingSum)} avventer` : ""),
        warning: econStatus !== "green" ? `Avventende ${fmtPct(pendingPct)}` : undefined,
      },
      {
        title: "Risiko",
        icon: <ShieldAlert className="h-3.5 w-3.5" />,
        status: riskStatus,
        mainValue: String(riskScore),
        mainLabel: "Poeng",
        secondary: highOpen > 0 ? `${highOpen} HIGH · ${projectRisks.length} åpne` : `${projectRisks.length} åpne`,
        warning: riskStatus !== "green" ? (highOpen > 0 ? `${highOpen} HIGH åpne` : `Score ${riskScore}`) : undefined,
      },
      {
        title: "Tillegg",
        icon: <FilePlus2 className="h-3.5 w-3.5" />,
        status: tilleggStatus,
        mainValue: identified > 0 ? `${sentApproved}/${identified} (${fmtPct(ratio)})` : "—",
        mainLabel: "Sendt / identifisert",
        secondary: draftCount > 0 ? `${draftCount} utkast` : "Ingen utkast",
        warning: tilleggStatus !== "green" ? "Lav sendt-rate" : undefined,
      },
      {
        title: "Cashflow",
        icon: <Wallet className="h-3.5 w-3.5" />,
        status: cashStatus,
        mainValue: `${fmtPct(outPct)} eksponering`,
        mainLabel: "Likviditet",
        secondary: totalNow > 0 ? `${currency} ${fmtNOK(outstanding)} utestående` : "—",
        warning: cashStatus !== "green"
          ? (outPct > 0.35 ? `Utestående > 35 %` : hasLateRisk ? "Betalingsrisiko" : `Utestående ${fmtPct(outPct)}`)
          : undefined,
      },
    ]);
  }, [jobId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!cards) return null;

  return (
    <div className="rounded-3xl bg-card shadow-sm p-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div
            key={card.title}
            className={`
              rounded-2xl bg-muted/30 border-l-[3px] ${BORDER_LEFT[card.status]}
              px-4 py-3.5 flex flex-col min-h-[112px]
            `}
          >
            {/* Header row */}
            <div className="flex items-center gap-1.5 mb-2">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                {card.icon}
                {card.title}
              </span>
            </div>

            {/* Main value */}
            <p className="text-[28px] leading-8 font-semibold text-foreground font-mono tracking-tight truncate">
              {card.mainValue}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{card.mainLabel}</p>

            {/* Secondary */}
            <p className="text-xs text-muted-foreground mt-auto pt-2 truncate">{card.secondary}</p>

            {/* Warning line – only when not green */}
            {card.warning && (
              <p className="text-[10px] font-medium text-destructive mt-1 truncate">{card.warning}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
