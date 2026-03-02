import { useState, useEffect, useCallback, useRef } from "react";
import { getRiskFlagLabel } from "@/lib/risk-flag-labels";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { SharePointExplorer } from "@/components/SharePointExplorer";
import {
  FileText,
  Upload,
  Download,
  Trash2,
  ExternalLink,
  Loader2,
  Sparkles,
  Tag,
  RotateCcw,
  Copy,
  CheckCircle2,
  MessageSquarePlus,
  Camera,
  X,
  Send,
  StickyNote,
  Mail,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface DocumentRow {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number | null;
  category: string;
  ai_category: string | null;
  ai_classified_at: string | null;
  ai_confidence: number | null;
  source_type: string;
  public_url: string | null;
  storage_bucket: string;
  uploaded_by: string | null;
  created_at: string;
  deleted_at: string | null;
}

interface AnalysisRow {
  id: string;
  document_id: string;
  analysis_type: string;
  parsed_fields: any;
  confidence: number | null;
  created_at: string;
}

const CATEGORIES = [
  { value: "offer", label: "Tilbud" },
  { value: "contract", label: "Kontrakt" },
  { value: "drawing", label: "Tegning" },
  { value: "fdv", label: "FDV" },
  { value: "image", label: "Bilde" },
  { value: "other", label: "Annet" },
];

const CATEGORY_MAP: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

const TAB_FILTERS = [
  { value: "all", label: "Alle" },
  ...CATEGORIES,
];

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Map errorType to user-friendly advice
function getErrorAdvice(errorType: string): string {
  switch (errorType) {
    case "FILE_TOO_LARGE": return "Last opp en mindre fil (maks 10 MB).";
    case "FILE_TOO_LARGE_FOR_AI": return "Filen er for stor for AI-analyse. Del opp dokumentet eller last opp mindre fil.";
    case "SCANNED_PDF": return "PDF-en mangler tekst. Lim inn teksten manuelt.";
    case "PDF_TEXT_MISSING": return "PDF-en inneholder ikke lesbar tekst (ofte skannet). Bruk OCR eller lim inn tekst manuelt.";
    case "OUTPUT_PARSE_ERROR": return "AI-svaret kunne ikke tolkes. Prøv igjen. Kontakt support med referanse hvis det gjentar seg.";
    case "INVALID_FILE": return "Prøv med PDF, Word eller bilde.";
    case "AI_TIMEOUT": return "Prøv igjen om litt.";
    case "RATE_LIMIT": return "Vent litt og prøv igjen.";
    case "AI_ERROR": return "Prøv igjen. Feilen kan være midlertidig.";
    default: return "Prøv igjen eller kontakt support.";
  }
}

interface DocumentCenterProps {
  jobId: string;
  companyId?: string | null;
}

export function DocumentCenter({ jobId, companyId }: DocumentCenterProps) {
  const { user, isAdmin } = useAuth();
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [analyzedDocs, setAnalyzedDocs] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const analysisInFlightRef = useRef(false);

  // SharePoint connection state
  const [spConnection, setSpConnection] = useState<{
    projectCode: string | null;
    siteId: string | null;
    driveId: string | null;
    folderId: string | null;
    folderWebUrl: string | null;
    connectedAt: string | null;
  }>({
    projectCode: null, siteId: null, driveId: null, folderId: null, folderWebUrl: null, connectedAt: null,
  });

  // Quick note state
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteImageFile, setNoteImageFile] = useState<File | null>(null);
  const [noteImagePreview, setNoteImagePreview] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const noteImageRef = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async () => {
    const { data } = await supabase
      .from("documents")
      .select("*")
      .eq("entity_type", "job")
      .eq("entity_id", jobId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (data) setDocs(data as any);

    const { data: analysesData } = await supabase
      .from("document_analyses")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    if (analysesData) {
      setAnalyses(analysesData as any);
      const analyzed = new Set<string>();
      (analysesData as any[]).forEach(a => analyzed.add(a.document_id));
      setAnalyzedDocs(analyzed);
    }

    setLoading(false);
  }, [jobId]);

  const fetchSharePointConnection = useCallback(async () => {
    const { data } = await supabase
      .from("events")
      .select("sharepoint_project_code, sharepoint_site_id, sharepoint_drive_id, sharepoint_folder_id, sharepoint_folder_web_url, sharepoint_connected_at")
      .eq("id", jobId)
      .single();
    if (data) {
      setSpConnection({
        projectCode: (data as any).sharepoint_project_code,
        siteId: (data as any).sharepoint_site_id,
        driveId: (data as any).sharepoint_drive_id,
        folderId: (data as any).sharepoint_folder_id,
        folderWebUrl: (data as any).sharepoint_folder_web_url,
        connectedAt: (data as any).sharepoint_connected_at,
      });
    }
  }, [jobId]);

  useEffect(() => { fetchDocs(); fetchSharePointConnection(); }, [fetchDocs, fetchSharePointConnection]);

  // Handle note image selection
  const handleNoteImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Bildet er for stort (maks 10 MB)");
      return;
    }
    setNoteImageFile(file);
    setNoteImagePreview(URL.createObjectURL(file));
  };

  const handleSaveNote = async () => {
    if (!noteText.trim() && !noteImageFile) return;
    setSavingNote(true);

    let imageUrl: string | null = null;

    // Upload image if present
    if (noteImageFile) {
      const filePath = `${jobId}/note-${Date.now()}-${noteImageFile.name.replace(/[^\w.\-()]/g, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from("job-attachments")
        .upload(filePath, noteImageFile);

      if (uploadError) {
        toast.error("Kunne ikke laste opp bilde");
        setSavingNote(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("job-attachments")
        .getPublicUrl(filePath);
      imageUrl = urlData.publicUrl;

      // Also register as a document
      await supabase.from("documents").insert({
        entity_type: "job",
        entity_id: jobId,
        file_name: noteImageFile.name,
        file_path: filePath,
        mime_type: noteImageFile.type,
        file_size: noteImageFile.size,
        storage_bucket: "job-attachments",
        public_url: imageUrl,
        uploaded_by: user?.id || null,
        company_id: companyId || null,
        category: "image",
      });
    }

    // Save as activity log
    const metadata: any = {};
    if (imageUrl) metadata.image_url = imageUrl;

    await supabase.from("activity_log").insert({
      entity_type: "job",
      entity_id: jobId,
      action: "note_added",
      type: "note",
      title: "Notat lagt til",
      description: noteText.trim() || (imageUrl ? "Bilde lagt til" : ""),
      performed_by: user?.id || null,
      metadata,
    });

    toast.success("Notat lagret");
    setNoteText("");
    setNoteImageFile(null);
    setNoteImagePreview(null);
    setShowQuickNote(false);
    setSavingNote(false);
    fetchDocs();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);

    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`Filen er for stor. Maks 50MB.`, { description: file.name });
        continue;
      }

      const filePath = `${jobId}/${Date.now()}-${file.name.replace(/[^\w.\-()]/g, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from("job-attachments")
        .upload(filePath, file);

      if (uploadError) {
        toast.error(`Opplasting feilet: ${file.name}`, { description: uploadError.message });
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("job-attachments")
        .getPublicUrl(filePath);

      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
      const category = isImage ? "image" : "other";

      const { error: dbError } = await supabase.from("documents").insert({
        entity_type: "job",
        entity_id: jobId,
        file_name: file.name,
        file_path: filePath,
        mime_type: file.type || "application/octet-stream",
        file_size: file.size,
        storage_bucket: "job-attachments",
        public_url: urlData.publicUrl,
        uploaded_by: user?.id || null,
        company_id: companyId || null,
        category,
      });

      if (dbError) {
        toast.error(`Kunne ikke registrere ${file.name}`);
        continue;
      }

      toast.success(`${file.name} lastet opp`);
    }

    if (fileRef.current) fileRef.current.value = "";
    setUploading(false);
    fetchDocs();
  };

  const handleCategoryChange = async (docId: string, newCategory: string) => {
    const { error } = await supabase
      .from("documents")
      .update({ category: newCategory })
      .eq("id", docId);
    if (error) {
      toast.error("Kunne ikke oppdatere kategori");
    } else {
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, category: newCategory } : d));
    }
  };

  const handleDelete = async (doc: DocumentRow) => {
    const { error } = await supabase
      .from("documents")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id } as any)
      .eq("id", doc.id);
    if (error) {
      toast.error("Kunne ikke slette dokument");
    } else {
      toast.success("Dokument slettet");
      setDocs(prev => prev.filter(d => d.id !== doc.id));
    }
  };

  const handleAnalyze = async (doc: DocumentRow) => {
    if (analysisInFlightRef.current || analyzingId) {
      toast.info("Analyse kjører allerede. Vent til den er ferdig.");
      return;
    }
    const analysisType = doc.category === "offer" ? "offer" : "contract";
    analysisInFlightRef.current = true;
    setAnalyzingId(doc.id);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-document", {
        body: {
          document_id: doc.id,
          job_id: jobId,
          analysis_type: analysisType,
        },
      });

      if (error) {
        // Network/invoke error
        toast.error("AI-analyse feilet", {
          description: "Nettverksfeil. Prøv igjen.",
          action: {
            label: "Prøv igjen",
            onClick: () => {
              if (!analysisInFlightRef.current) handleAnalyze(doc);
            },
          },
        });
      } else if (data?.ok === false) {
        // Structured error from edge function
        const requestId = data.requestId || "ukjent";
        const advice = getErrorAdvice(data.errorType || "");
        toast.error(data.message || "AI-analyse feilet", {
          description: `${advice} (Ref: ${requestId.substring(0, 8)})`,
          duration: 8000,
          action: {
            label: "Kopier ref",
            onClick: () => {
              navigator.clipboard.writeText(requestId);
              toast.info("Referanse kopiert");
            },
          },
        });
      } else if (data?.error) {
        // Legacy error format
        toast.error("AI-analyse feilet", {
          description: String(data.error),
          action: {
            label: "Prøv igjen",
            onClick: () => {
              if (!analysisInFlightRef.current) handleAnalyze(doc);
            },
          },
        });
      } else {
        toast.success(`${analysisType === "offer" ? "Tilbudsanalyse" : "Kontraktanalyse"} fullført`);
        fetchDocs();
      }
    } catch (err: any) {
      toast.error("Feil ved analyse", {
        description: err.message,
        action: {
          label: "Prøv igjen",
          onClick: () => {
            if (!analysisInFlightRef.current) handleAnalyze(doc);
          },
        },
      });
    }

    analysisInFlightRef.current = false;
    setAnalyzingId(null);
  };

  const filtered = activeTab === "all" ? docs : docs.filter(d => d.category === activeTab);

  const latestOfferAnalysis = analyses.find(a => a.analysis_type === "offer");
  const latestContractAnalysis = analyses.find(a => a.analysis_type === "contract");

  return (
    <div className="space-y-4">
      {/* Header + Upload */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Dokumentsenter
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowQuickNote(!showQuickNote)}
            className="gap-1.5 rounded-xl text-xs"
          >
            <StickyNote className="h-3.5 w-3.5" />
            Notat
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="gap-1.5 rounded-xl text-xs"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Last opp
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            onChange={handleUpload}
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp"
          />
        </div>
      </div>

      {/* Quick Note section */}
      {showQuickNote && (
        <div className="rounded-xl border border-border/40 p-4 bg-secondary/20 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-primary" />
              Legg til notat
            </h4>
            <button onClick={() => setShowQuickNote(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Skriv notat, kommentar eller observasjon..."
            rows={3}
          />

          {/* Image preview */}
          {noteImagePreview && (
            <div className="relative inline-block">
              <img
                src={noteImagePreview}
                alt="Vedlagt bilde"
                className="max-h-32 rounded-lg border border-border/40"
              />
              <button
                onClick={() => { setNoteImageFile(null); setNoteImagePreview(null); }}
                className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => noteImageRef.current?.click()}
            >
              <Camera className="h-3.5 w-3.5" />
              Legg til bilde
            </Button>
            <input
              ref={noteImageRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleNoteImage}
              className="hidden"
            />
            <Button
              size="sm"
              className="gap-1.5 text-xs ml-auto"
              onClick={handleSaveNote}
              disabled={savingNote || (!noteText.trim() && !noteImageFile)}
            >
              {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Lagre notat
            </Button>
          </div>
        </div>
      )}


      {/* SharePoint Explorer */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <SharePointExplorer
          jobId={jobId}
          companyId={companyId}
          connection={spConnection}
          onConnectionChange={fetchSharePointConnection}
        />
      </div>

      {/* Analysis summary cards */}
      {latestOfferAnalysis && (
        <AnalysisSummaryCard
          title="Tilbudssammendrag"
          analysis={latestOfferAnalysis}
          type="offer"
        />
      )}
      {latestContractAnalysis && (
        <AnalysisSummaryCard
          title="Kontraktsammendrag"
          analysis={latestContractAnalysis}
          type="contract"
        />
      )}

      {/* Filter tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8 w-full justify-start overflow-x-auto">
          {TAB_FILTERS.map(t => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs px-2.5 py-1">
              {t.label}
              {t.value !== "all" && (
                <span className="ml-1 text-muted-foreground">
                  ({docs.filter(d => d.category === t.value).length})
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Documents list */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">
            {activeTab === "all" ? "Ingen dokumenter lastet opp." : `Ingen ${CATEGORY_MAP[activeTab]?.toLowerCase() || "dokumenter"} funnet.`}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 gap-1.5 text-xs"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Last opp fil
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(doc => {
            const hasAnalysis = analyzedDocs.has(doc.id);
            return (
              <div
                key={doc.id}
                className="flex items-center gap-2 rounded-xl border border-border/40 p-3 hover:bg-accent/10 transition-colors"
              >
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{doc.file_name}</p>
                    {hasAnalysis && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    )}
                    {doc.source_type === "email" && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-400">
                        <Mail className="h-2.5 w-2.5 mr-0.5" />
                        E-post
                      </Badge>
                    )}
                    {doc.ai_category && doc.ai_classified_at && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 border-violet-200 text-violet-600 dark:border-violet-800 dark:text-violet-400">
                        <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                        AI {doc.ai_confidence ? `${Math.round(doc.ai_confidence * 100)}%` : ""}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {doc.file_size && <span>{formatSize(doc.file_size)}</span>}
                    <span>{format(new Date(doc.created_at), "d. MMM yyyy", { locale: nb })}</span>
                    {hasAnalysis && (
                      <span className="text-green-600 font-medium">Analysert</span>
                    )}
                  </div>
                </div>

                {/* Category selector */}
                <Select
                  value={doc.category}
                  onValueChange={(v) => handleCategoryChange(doc.id, v)}
                >
                  <SelectTrigger className="h-7 w-24 text-[11px] rounded-lg">
                    <Tag className="h-3 w-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value} className="text-xs">
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* AI analyze button for offer/contract */}
                {(doc.category === "offer" || doc.category === "contract") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 rounded-lg"
                    disabled={analyzingId !== null}
                    onClick={() => handleAnalyze(doc)}
                    title={
                      hasAnalysis
                        ? "Analyser på nytt"
                        : doc.category === "offer"
                        ? "Analyser tilbud"
                        : "Analyser kontrakt"
                    }
                  >
                    {analyzingId === doc.id ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="sr-only">Analyserer dokument...</span>
                      </>
                    ) : hasAnalysis ? (
                      <RotateCcw className="h-3 w-3" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                  </Button>
                )}

                {/* Preview/open */}
                {doc.storage_bucket === "email-attachments" ? (
                  <button
                    onClick={async () => {
                      const { data } = await supabase.storage
                        .from("email-attachments")
                        .createSignedUrl(doc.file_path, 3600);
                      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                    }}
                    className="text-primary hover:text-primary/80 shrink-0"
                    title="Åpne"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                ) : doc.public_url ? (
                  <a
                    href={doc.public_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}

                {/* Download */}
                {doc.public_url && doc.storage_bucket !== "email-attachments" && (
                  <a
                    href={doc.public_url}
                    download={doc.file_name}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                )}

                {/* Delete */}
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(doc)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Analysis Summary Card ── */
function AnalysisSummaryCard({ title, analysis, type }: { title: string; analysis: AnalysisRow; type: string }) {
  const [showAllReservations, setShowAllReservations] = useState(false);
  const [showAllFlags, setShowAllFlags] = useState(false);
  const fields = analysis.parsed_fields || {};

  const MAX_RESERVATIONS = 3;
  const MAX_FLAGS = 5;

  const reservations: string[] = fields.reservations || [];
  const riskFlags: string[] = fields.risk_flags || [];
  const visibleReservations = showAllReservations ? reservations : reservations.slice(0, MAX_RESERVATIONS);
  const visibleFlags = showAllFlags ? riskFlags : riskFlags.slice(0, MAX_FLAGS);

  return (
    <div className="rounded-xl border border-border/60 bg-accent/10 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {title}
        </h4>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {analysis.confidence && (
            <Badge variant="outline" className="text-[10px] h-5">
              {analysis.confidence}% konfidens
            </Badge>
          )}
          <span>{format(new Date(analysis.created_at), "d. MMM HH:mm", { locale: nb })}</span>
        </div>
      </div>

      {type === "offer" && (
        <div className="space-y-1.5 text-sm">
          {fields.total_amount != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Totalbeløp</span>
              <span className="font-mono font-medium">
                {fields.currency || "NOK"} {Number(fields.total_amount).toLocaleString("nb-NO")}
              </span>
            </div>
          )}
          {fields.scope_summary && (
            <div>
              <p className="text-muted-foreground text-xs mb-1">Omfang</p>
              <p className="text-xs">{fields.scope_summary}</p>
            </div>
          )}
          {reservations.length > 0 && (
            <div>
              <p className="text-muted-foreground text-xs mb-1">Forbehold</p>
              <ul className="text-xs list-disc list-inside space-y-0.5">
                {visibleReservations.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
              {reservations.length > MAX_RESERVATIONS && (
                <button
                  onClick={() => setShowAllReservations(!showAllReservations)}
                  className="text-xs text-primary hover:underline mt-1"
                >
                  {showAllReservations ? "Vis færre" : `+ ${reservations.length - MAX_RESERVATIONS} flere`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {type === "contract" && (
        <div className="space-y-1.5 text-sm">
          {fields.parties && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Parter</span>
              <span className="text-xs truncate max-w-[60%] text-right">{fields.parties}</span>
            </div>
          )}
          {fields.start_date && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Periode</span>
              <span className="text-xs">{fields.start_date} – {fields.end_date || "?"}</span>
            </div>
          )}
          {fields.payment_terms && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Betalingsvilkår</span>
              <span className="text-xs truncate max-w-[60%] text-right">{fields.payment_terms}</span>
            </div>
          )}
          {riskFlags.length > 0 && (
            <div>
              <p className="text-destructive text-xs font-medium mb-1">🚩 Røde flagg</p>
              <ul className="text-xs list-disc list-inside space-y-0.5 text-destructive/80">
                {visibleFlags.map((f: string, i: number) => (
                  <li key={i}>{getRiskFlagLabel(f)}</li>
                ))}
              </ul>
              {riskFlags.length > MAX_FLAGS && (
                <button
                  onClick={() => setShowAllFlags(!showAllFlags)}
                  className="text-xs text-primary hover:underline mt-1"
                >
                  {showAllFlags ? "Vis færre" : `+ ${riskFlags.length - MAX_FLAGS} flere`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
