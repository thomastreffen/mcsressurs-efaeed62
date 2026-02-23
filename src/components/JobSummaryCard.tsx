import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getRiskFlagLabel } from "@/lib/risk-flag-labels";
import {
  Sparkles,
  RefreshCw,
  Trash2,
  Lock,
  Unlock,
  Loader2,
  DollarSign,
  AlertTriangle,
  FileText,
  ChevronDown,
} from "lucide-react";

interface KeyNumbers {
  total_amount?: number;
  currency?: string;
  parties?: string;
  start_date?: string;
  end_date?: string;
  payment_terms?: string;
}

interface JobSummary {
  id: string;
  job_id: string;
  summary_text: string | null;
  key_numbers: KeyNumbers;
  source: string;
  is_locked: boolean;
  updated_at: string;
}

interface AnalysisRow {
  id: string;
  document_id: string;
  analysis_type: string;
  parsed_fields: any;
  confidence: number | null;
  created_at: string;
}

interface JobSummaryCardProps {
  jobId: string;
  customer?: string;
  status?: string;
  address?: string;
  technicianNames?: string[];
}

export function JobSummaryCard({ jobId, customer, status, address, technicianNames }: JobSummaryCardProps) {
  const { isAdmin } = useAuth();
  const [summary, setSummary] = useState<JobSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchSummary = useCallback(async () => {
    const { data } = await supabase
      .from("job_summaries")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle();
    setSummary(data as any);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const buildSummaryFromAnalyses = useCallback(async () => {
    const { data: analyses } = await supabase
      .from("document_analyses")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (!analyses || analyses.length === 0) {
      toast.info("Ingen analyser funnet. Last opp og analyser et dokument først.");
      return null;
    }

    const offerAnalysis = analyses.find((a: any) => a.analysis_type === "offer");
    const contractAnalysis = analyses.find((a: any) => a.analysis_type === "contract");

    const keyNumbers: KeyNumbers = {};
    const summaryParts: string[] = [];
    const reservations: string[] = [];
    const riskFlags: string[] = [];

    if (offerAnalysis) {
      const f = (offerAnalysis as any).parsed_fields || {};
      if (f.total_amount != null) {
        keyNumbers.total_amount = Number(f.total_amount);
        keyNumbers.currency = f.currency || "NOK";
      }
      if (f.scope_summary) summaryParts.push(f.scope_summary);
      if (f.reservations?.length > 0) reservations.push(...f.reservations);
    }

    if (contractAnalysis) {
      const f = (contractAnalysis as any).parsed_fields || {};
      if (f.parties) keyNumbers.parties = f.parties;
      if (f.start_date) keyNumbers.start_date = f.start_date;
      if (f.end_date) keyNumbers.end_date = f.end_date;
      if (f.payment_terms) keyNumbers.payment_terms = f.payment_terms;
      if (f.risk_flags?.length > 0) riskFlags.push(...f.risk_flags);
    }

    let summaryText = "";
    if (summaryParts.length > 0) summaryText += summaryParts.join("\n\n");
    if (reservations.length > 0) {
      summaryText += "\n\nForbehold:\n" + reservations.map(r => `• ${r}`).join("\n");
    }
    if (riskFlags.length > 0) {
      summaryText += "\n\nRøde flagg:\n" + riskFlags.map(f => `• ${getRiskFlagLabel(f)}`).join("\n");
    }

    return { summaryText: summaryText.trim(), keyNumbers, source: offerAnalysis ? "offer" : "contract" };
  }, [jobId]);

  const handleUpdate = async () => {
    if (summary?.is_locked) {
      toast.info("Oppsummeringen er låst. Lås opp for å oppdatere.");
      return;
    }
    setUpdating(true);
    const result = await buildSummaryFromAnalyses();
    if (!result) { setUpdating(false); return; }

    const { data: user } = await supabase.auth.getUser();

    if (summary) {
      await supabase.from("job_summaries").update({
        summary_text: result.summaryText,
        key_numbers: result.keyNumbers as any,
        source: result.source,
        updated_by: user.user?.id || null,
      } as any).eq("job_id", jobId);
    } else {
      await supabase.from("job_summaries").insert({
        job_id: jobId,
        summary_text: result.summaryText,
        key_numbers: result.keyNumbers as any,
        source: result.source,
        updated_by: user.user?.id || null,
      } as any);
    }

    toast.success("Oppsummering oppdatert");
    fetchSummary();
    setUpdating(false);
  };

  const handleRemove = async () => {
    if (!summary) return;
    await supabase.from("job_summaries").delete().eq("id", summary.id);
    setSummary(null);
    toast.success("Oppsummering fjernet");
  };

  const handleToggleLock = async () => {
    if (!summary) return;
    await supabase.from("job_summaries").update({
      is_locked: !summary.is_locked,
    } as any).eq("id", summary.id);
    setSummary(prev => prev ? { ...prev, is_locked: !prev.is_locked } : null);
    toast.success(summary.is_locked ? "Oppsummering låst opp" : "Oppsummering låst");
  };

  if (loading) return null;

  const kn = summary?.key_numbers || {} as KeyNumbers;

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Jobboppsummering
          {summary?.is_locked && (
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </h3>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 rounded-lg"
              onClick={handleUpdate}
              disabled={updating}
            >
              {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Oppdater
            </Button>
            {summary && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1 rounded-lg"
                  onClick={handleToggleLock}
                >
                  {summary.is_locked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {summary.is_locked ? "Lås opp" : "Lås"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1 rounded-lg text-destructive hover:text-destructive"
                  onClick={handleRemove}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {!summary ? (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">Ingen oppsummering ennå.</p>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 gap-1.5 text-xs rounded-xl"
              onClick={handleUpdate}
              disabled={updating}
            >
              {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Generer fra analyser
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Key numbers grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {kn.total_amount != null && (
              <div className="rounded-xl bg-primary/5 border border-primary/10 p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Verdi</p>
                <p className="text-sm font-bold text-foreground mt-0.5">
                  {(kn.currency || "NOK")} {Number(kn.total_amount).toLocaleString("nb-NO")}
                </p>
              </div>
            )}
            {kn.parties && (
              <div className="rounded-xl bg-secondary/50 border border-border/40 p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Parter</p>
                <p className="text-xs font-medium text-foreground mt-0.5 truncate">{kn.parties}</p>
              </div>
            )}
            {kn.payment_terms && (
              <div className="rounded-xl bg-secondary/50 border border-border/40 p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Betaling</p>
                <p className="text-xs font-medium text-foreground mt-0.5 truncate">{kn.payment_terms}</p>
              </div>
            )}
            {kn.start_date && (
              <div className="rounded-xl bg-secondary/50 border border-border/40 p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Periode</p>
                <p className="text-xs font-medium text-foreground mt-0.5">{kn.start_date} – {kn.end_date || "?"}</p>
              </div>
            )}
          </div>

          {/* Summary text with expand */}
          {summary.summary_text && (
            <div>
              <p className={`text-sm text-muted-foreground whitespace-pre-wrap ${!expanded ? "line-clamp-4" : ""}`}>
                {summary.summary_text}
              </p>
              {summary.summary_text.length > 200 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-primary hover:underline mt-1 flex items-center gap-1"
                >
                  <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
                  {expanded ? "Vis mindre" : "Vis mer"}
                </button>
              )}
            </div>
          )}

          {/* Source badge */}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant="outline" className="text-[10px] h-5">
              {summary.source === "offer" ? "Fra tilbud" : summary.source === "contract" ? "Fra kontrakt" : "Manuell"}
            </Badge>
            <span>Sist oppdatert: {new Date(summary.updated_at).toLocaleDateString("nb-NO")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
