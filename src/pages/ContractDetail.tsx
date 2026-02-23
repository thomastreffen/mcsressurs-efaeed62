import { useParams, useNavigate } from "react-router-dom";
import { useState, useRef } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  useContract,
  useContractDeadlines,
  useContractDocuments,
  useContractAlerts,
  useAnalyzeContract,
} from "@/hooks/useContracts";
import { ContractRiskBadge } from "@/components/contracts/ContractRiskBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Brain, Loader2, FileText, Upload,
  CalendarDays, AlertTriangle, CheckCircle2, Clock,
  Download, ShieldAlert, ClipboardPaste,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  draft: "Utkast",
  signed: "Signert",
  archived: "Arkivert",
};

const DEADLINE_TYPE_LABELS: Record<string, string> = {
  completion: "Ferdigstillelse",
  milestone: "Milepæl",
  notice: "Varsel",
  documentation: "Dokumentasjon",
  warranty_end: "Garantislutt",
  other: "Annet",
};

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();

  const { data: contract, isLoading } = useContract(id);
  const { data: deadlines } = useContractDeadlines(id);
  const { data: documents } = useContractDocuments(id);
  const { data: alerts } = useContractAlerts(id);
  const analyzeContract = useAnalyzeContract();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showTextPaste, setShowTextPaste] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [analyzingText, setAnalyzingText] = useState(false);

  /* ── File upload with audit ── */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id || !user || !activeCompanyId) return;

    setUploading(true);
    try {
      const filePath = `${activeCompanyId}/${id}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("contract-documents")
        .upload(filePath, file);

      if (uploadErr) throw uploadErr;

      const currentMaxVersion = documents?.reduce((max, d) => Math.max(max, d.version), 0) || 0;
      const newVersion = currentMaxVersion + 1;

      if (currentMaxVersion > 0) {
        await supabase
          .from("contract_documents")
          .update({ is_primary: false } as any)
          .eq("contract_id", id)
          .eq("is_primary", true);
      }

      await supabase.from("contract_documents").insert({
        company_id: activeCompanyId,
        contract_id: id,
        file_name: file.name,
        file_path: filePath,
        mime_type: file.type || "application/octet-stream",
        version: newVersion,
        is_primary: true,
        uploaded_by: user.id,
      } as any);

      // Audit: contract_document_uploaded
      await supabase.from("activity_log").insert({
        entity_id: id,
        entity_type: "contract",
        action: "contract_document_uploaded",
        type: "note",
        performed_by: user.id,
        description: `Dokument lastet opp: ${file.name} (v${newVersion})`,
        metadata: { version: newVersion, is_primary: true, file_name: file.name },
      } as any);

      queryClient.invalidateQueries({ queryKey: ["contract-documents", id] });
      toast.success("Dokument lastet opp", { description: `v${newVersion}: ${file.name}` });
    } catch (err: any) {
      toast.error("Opplasting feilet", { description: err.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* ── Download document ── */
  const handleDownload = async (doc: { file_path: string; file_name: string }) => {
    const { data } = await supabase.storage
      .from("contract-documents")
      .createSignedUrl(doc.file_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Kunne ikke generere nedlastingslenke");
  };

  /* ── Mark deadline done with audit ── */
  const handleDeadlineDone = async (deadlineId: string) => {
    await supabase
      .from("contract_deadlines")
      .update({ status: "done" } as any)
      .eq("id", deadlineId);

    // Audit: contract_deadline_done
    if (user) {
      await supabase.from("activity_log").insert({
        entity_id: id!,
        entity_type: "contract",
        action: "contract_deadline_done",
        type: "note",
        performed_by: user.id,
        description: `Frist markert som fullført.`,
        metadata: { deadline_id: deadlineId },
      } as any);
    }

    queryClient.invalidateQueries({ queryKey: ["contract-deadlines", id] });
    toast.success("Frist markert som fullført");
  };

  /* ── Analyze with pasted text ── */
  const handleAnalyzeText = async () => {
    if (!pastedText.trim() || !id) return;
    setAnalyzingText(true);
    try {
      const { data, error } = await supabase.functions.invoke("contract-ai", {
        body: { action: "analyze_contract", contract_id: id, text_override: pastedText },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ["contract", id] });
      queryClient.invalidateQueries({ queryKey: ["contract-deadlines", id] });
      queryClient.invalidateQueries({ queryKey: ["contract-alerts"] });
      toast.success("AI-analyse fullført fra innlimt tekst");
      setShowTextPaste(false);
      setPastedText("");
    } catch (err: any) {
      toast.error("AI-analyse feilet", { description: err.message });
    } finally {
      setAnalyzingText(false);
    }
  };

  /* ── Handle analyze with error_code catch ── */
  const handleAnalyze = async () => {
    if (!id) return;
    try {
      await analyzeContract.mutateAsync(id);
    } catch (err: any) {
      // Check if error is pdf_text_missing → show text paste
      if (err?.message?.includes("Lim inn tekst") || err?.message?.includes("pdf_text_missing")) {
        setShowTextPaste(true);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold">Kontrakt ikke funnet</p>
          <Button variant="outline" onClick={() => navigate("/contracts")}>Tilbake</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/contracts")} className="shrink-0 mt-0.5 rounded-xl h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold truncate">{contract.title}</h1>
            <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[contract.status] || contract.status}</Badge>
            <ContractRiskBadge riskLevel={contract.risk_level} riskScore={contract.risk_score || undefined} size="md" />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
            {contract.counterparty_name && <span>Motpart: {contract.counterparty_name}</span>}
            {contract.contract_type && <span>Type: {contract.contract_type}</span>}
            {contract.end_date && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Frist: {format(new Date(contract.end_date), "d. MMM yyyy", { locale: nb })}
              </span>
            )}
          </div>
        </div>
        <Button
          onClick={handleAnalyze}
          disabled={analyzeContract.isPending || !documents?.length}
          className="gap-2 shrink-0"
        >
          {analyzeContract.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          Analyser
        </Button>
      </div>

      {/* Alerts banner */}
      {alerts && alerts.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <span className="text-sm font-medium text-orange-800 dark:text-orange-200">
              {alerts.length} aktive varsler
            </span>
          </div>
          <div className="space-y-1">
            {alerts.slice(0, 3).map((a) => (
              <p key={a.id} className="text-xs text-orange-700 dark:text-orange-300">{a.title}</p>
            ))}
          </div>
        </div>
      )}

      {/* Text paste fallback */}
      {showTextPaste && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardPaste className="h-4 w-4 text-yellow-700 dark:text-yellow-300" />
            <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              PDF-tekst kunne ikke leses automatisk
            </span>
          </div>
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            Lim inn kontraktteksten nedenfor for å analysere manuelt. Kopiér teksten fra PDF-en og lim den inn her.
          </p>
          <Textarea
            placeholder="Lim inn kontrakttekst her..."
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={8}
            className="bg-background"
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={handleAnalyzeText}
              disabled={analyzingText || pastedText.trim().length < 100}
              className="gap-2"
            >
              {analyzingText ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              Analyser tekst
            </Button>
            <Button variant="ghost" onClick={() => { setShowTextPaste(false); setPastedText(""); }}>
              Avbryt
            </Button>
            {pastedText.trim().length > 0 && pastedText.trim().length < 100 && (
              <span className="text-xs text-muted-foreground">Minimum 100 tegn</span>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Oversikt</TabsTrigger>
          <TabsTrigger value="deadlines">
            Frister
            {deadlines && deadlines.filter((d) => d.status === "open").length > 0 && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                {deadlines.filter((d) => d.status === "open").length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="documents">
            Dokumenter
            {documents && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {documents.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="space-y-6">
          <div className="rounded-xl border border-border/60 bg-accent/20 p-3 flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              AI-assistent. Endelig vurdering og godkjenning må gjøres av ansvarlig. Kontraktdata kan inneholde feil.
            </p>
          </div>

          {contract.ai_summary_pl || contract.ai_summary_econ || contract.ai_summary_field ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { label: "Prosjektleder", content: contract.ai_summary_pl, icon: "👷" },
                { label: "Økonomi", content: contract.ai_summary_econ, icon: "💰" },
                { label: "Felt/Montør", content: contract.ai_summary_field, icon: "🔧" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border/60 p-4 space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <span>{s.icon}</span>
                    {s.label}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.content || "Ikke analysert ennå."}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 space-y-3">
              <Brain className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">Last opp et dokument og kjør AI-analyse for å se sammendrag.</p>
              <Button variant="outline" size="sm" onClick={() => setShowTextPaste(true)} className="gap-1.5">
                <ClipboardPaste className="h-3.5 w-3.5" /> Eller lim inn tekst
              </Button>
            </div>
          )}

          <div className="rounded-xl border border-border/60 p-4">
            <h3 className="text-sm font-semibold mb-3">Nøkkeldata</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Startdato</span>
                <p className="font-medium">{contract.start_date ? format(new Date(contract.start_date), "d. MMM yyyy", { locale: nb }) : "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Sluttdato</span>
                <p className="font-medium">{contract.end_date ? format(new Date(contract.end_date), "d. MMM yyyy", { locale: nb }) : "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Garanti</span>
                <p className="font-medium">{contract.warranty_months ? `${contract.warranty_months} mnd` : "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Dagbot</span>
                <p className="font-medium">
                  {contract.penalty_type && contract.penalty_type !== "ingen"
                    ? `${contract.penalty_type}${contract.penalty_rate ? ` ${contract.penalty_rate} ${contract.penalty_unit || ""}` : ""}`
                    : "Ingen"}
                </p>
              </div>
            </div>
            {contract.ai_confidence > 0 && (
              <p className="text-[11px] text-muted-foreground mt-3">
                Konfidensgrad: {contract.ai_confidence}% · Sist analysert: {contract.last_analyzed_at ? format(new Date(contract.last_analyzed_at), "d. MMM yyyy HH:mm", { locale: nb }) : "—"}
              </p>
            )}
          </div>
        </TabsContent>

        {/* ── Deadlines ── */}
        <TabsContent value="deadlines" className="space-y-3">
          {!deadlines || deadlines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Ingen frister registrert. Kjør AI-analyse for å generere frister automatisk.</p>
          ) : (
            deadlines.map((dl) => {
              const isPast = new Date(dl.due_date) < new Date();
              const isDone = dl.status === "done";
              return (
                <div
                  key={dl.id}
                  className={`rounded-xl border p-4 flex items-center gap-4 ${
                    isDone
                      ? "border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-800"
                      : isPast
                      ? "border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800"
                      : "border-border/60"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{dl.title}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {DEADLINE_TYPE_LABELS[dl.type] || dl.type}
                      </Badge>
                      {dl.severity === "critical" && (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <CalendarDays className="h-3 w-3" />
                      {format(new Date(dl.due_date), "d. MMMM yyyy", { locale: nb })}
                      {isPast && !isDone && <span className="text-red-600 font-medium">Forfalt!</span>}
                    </div>
                  </div>
                  {isDone ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl text-xs shrink-0"
                      onClick={() => handleDeadlineDone(dl.id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Ferdig
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </TabsContent>

        {/* ── Documents ── */}
        <TabsContent value="documents" className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx"
              onChange={handleFileUpload}
            />
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Last opp dokument
            </Button>
            <Button
              variant="ghost"
              className="gap-2"
              onClick={() => setShowTextPaste(true)}
            >
              <ClipboardPaste className="h-4 w-4" />
              Lim inn tekst
            </Button>
          </div>

          {!documents || documents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Ingen dokumenter lastet opp ennå.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`rounded-xl border p-3 flex items-center gap-3 ${doc.is_primary ? "border-primary/30 bg-primary/5" : "border-border/60"}`}
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.file_name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>v{doc.version}</span>
                      {doc.is_primary && <Badge variant="outline" className="text-[9px] py-0">Primær</Badge>}
                      <span>{format(new Date(doc.uploaded_at), "d. MMM yyyy HH:mm", { locale: nb })}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => handleDownload(doc)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
