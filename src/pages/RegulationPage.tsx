import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { BookOpen, Plus, Search, Send, Loader2, ImageIcon, X, AlertTriangle, ChevronDown, ChevronUp, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useFagRequests, type FagRegime, type FagPriority, type FagRequest, type FagAnswer } from "@/hooks/useFagRequests";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";

const REGIMES: { value: FagRegime; label: string }[] = [
  { value: "nek", label: "NEK" },
  { value: "fel", label: "FEL" },
  { value: "fse", label: "FSE" },
  { value: "fsl", label: "FSL" },
  { value: "annet", label: "Annet" },
];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new: { label: "Ny", className: "bg-muted text-muted-foreground" },
  analyzing: { label: "Analyserer…", className: "bg-primary/10 text-primary" },
  answered: { label: "Besvart", className: "bg-success/10 text-success" },
  needs_followup: { label: "Trenger oppfølging", className: "bg-accent/10 text-accent" },
  error: { label: "Feil", className: "bg-destructive/10 text-destructive" },
};

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function RegulationPage() {
  const { activeCompanyId } = useCompanyContext();
  const { requests, loading, fetchRequests, fetchAnswers, createRequest, uploadImage, updateImagePaths, analyzeRequest } = useFagRequests();

  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, FagAnswer[]>>({});

  // Form state
  const [regime, setRegime] = useState<FagRegime>("nek");
  const [question, setQuestion] = useState("");
  const [priority, setPriority] = useState<FagPriority>("normal");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const formRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newRequestRef = useRef<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Scroll to new request after creation
  useEffect(() => {
    if (newRequestRef.current) {
      const el = document.getElementById(`fag-${newRequestRef.current}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setExpandedId(newRequestRef.current);
        newRequestRef.current = null;
      }
    }
  }, [requests]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Kun JPG, PNG og WebP er støttet");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error("Bildet er for stort. Maks 10 MB.");
      return;
    }
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  }, []);

  const removeImage = useCallback(() => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [imagePreview]);

  const handleSubmit = useCallback(async () => {
    if (!question.trim() || !activeCompanyId) return;
    setSubmitting(true);
    try {
      // 1. Create request
      const req = await createRequest({ regime, question: question.trim(), priority });

      // 2. Upload image if present
      let imagePaths: string[] = [];
      let images: Array<{ path: string; mime_type: string }> = [];
      if (imageFile) {
        const path = await uploadImage(req.id, imageFile);
        imagePaths = [path];
        images = [{ path, mime_type: imageFile.type }];
        await updateImagePaths(req.id, imagePaths);
      }

      // 3. Reset form
      setQuestion("");
      setRegime("nek");
      setPriority("normal");
      removeImage();
      setShowForm(false);
      toast.success("Forespørsel sendt. AI analyserer…");
      newRequestRef.current = req.id;

      // 4. Trigger analysis
      await analyzeRequest({
        fag_request_id: req.id,
        company_id: activeCompanyId,
        regime,
        question: question.trim(),
        images,
      });

      // 5. Refresh
      await fetchRequests();
    } catch (err: any) {
      console.error("Submit error:", err);
      toast.error("Kunne ikke sende forespørsel", { description: err.message });
      await fetchRequests();
    } finally {
      setSubmitting(false);
    }
  }, [question, regime, priority, imageFile, activeCompanyId, createRequest, uploadImage, updateImagePaths, analyzeRequest, removeImage, fetchRequests]);

  const toggleExpand = useCallback(async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!answers[id]) {
      try {
        const a = await fetchAnswers(id);
        setAnswers(prev => ({ ...prev, [id]: a }));
      } catch (err) {
        console.warn("Failed to fetch answers:", err);
      }
    }
  }, [expandedId, answers, fetchAnswers]);

  const handleFollowupClick = useCallback((text: string) => {
    setQuestion(text);
    setShowForm(true);
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const openForm = useCallback(() => {
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return requests;
    const s = search.toLowerCase();
    return requests.filter(r =>
      r.question.toLowerCase().includes(s) ||
      r.regime.includes(s) ||
      r.ai_summary?.toLowerCase().includes(s)
    );
  }, [requests, search]);

  return (
    <div className="w-full p-5 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Fag
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Faglig veiledning og bildeanalyse — NEK, FEL, FSE, FSL
          </p>
        </div>
        {!showForm && (
          <Button onClick={openForm} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Ny forespørsel
          </Button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <div ref={formRef}>
          <Card className="border-primary/30">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Ny fagforespørsel</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="h-7 text-xs">
                  Avbryt
                </Button>
              </div>

              {/* Regime chips */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Regelverk</label>
                <div className="flex flex-wrap gap-2">
                  {REGIMES.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRegime(r.value)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                        regime === r.value
                          ? "bg-accent text-accent-foreground border-accent"
                          : "bg-secondary text-secondary-foreground border-border hover:bg-secondary/80"
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Spørsmål</label>
                <Textarea
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder="F.eks: Hva er kravet til kapslingsgrad for denne installasjonen?"
                  className="min-h-[140px] resize-y"
                />
              </div>

              {/* Image upload */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Bilde (valgfritt)</label>
                {imagePreview ? (
                  <div className="relative inline-block">
                    <img
                      src={imagePreview}
                      alt="Vedlagt bilde"
                      className="h-32 w-auto rounded-lg border border-border object-cover"
                    />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer.files?.[0];
                      if (file) {
                        const fakeEvent = { target: { files: [file] } } as any;
                        handleImageSelect(fakeEvent);
                      }
                    }}
                    className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/[0.02] transition-colors"
                  >
                    <Camera className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-xs text-muted-foreground">
                      Dra og slipp eller klikk for å velge bilde
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      JPG, PNG, WebP · Maks 10 MB
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Prioritet</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPriority("normal")}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                      priority === "normal"
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-secondary text-secondary-foreground border-border"
                    )}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriority("viktig")}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                      priority === "viktig"
                        ? "bg-accent/10 text-accent border-accent/30"
                        : "bg-secondary text-secondary-foreground border-border"
                    )}
                  >
                    Viktig
                  </button>
                </div>
              </div>

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={submitting || !question.trim()}
                className="w-full gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sender…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send forespørsel
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Søk i forespørsler…"
          className="pl-9"
        />
      </div>

      {/* Request list */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Laster…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">
              {requests.length === 0 ? "Ingen fagforespørsler ennå" : "Ingen treff"}
            </p>
            {requests.length === 0 && (
              <Button variant="outline" onClick={openForm} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Opprett første forespørsel
              </Button>
            )}
          </div>
        ) : (
          filtered.map(req => (
            <FagRequestCard
              key={req.id}
              request={req}
              expanded={expandedId === req.id}
              onToggle={() => toggleExpand(req.id)}
              answers={answers[req.id] || []}
              onFollowupClick={handleFollowupClick}
            />
          ))
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function FagRequestCard({
  request,
  expanded,
  onToggle,
  answers,
  onFollowupClick,
}: {
  request: FagRequest;
  expanded: boolean;
  onToggle: () => void;
  answers: FagAnswer[];
  onFollowupClick: (text: string) => void;
}) {
  const statusCfg = STATUS_CONFIG[request.status] || STATUS_CONFIG.new;
  const firstLine = request.question.split("\n")[0].substring(0, 120);
  const hasImage = request.image_paths.length > 0;

  return (
    <div id={`fag-${request.id}`} className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Compact row */}
      <button onClick={onToggle} className="w-full text-left p-4 hover:bg-secondary/30 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant="outline" className={cn("text-[10px]", regimeChipClass(request.regime))}>
                {request.regime.toUpperCase()}
              </Badge>
              <Badge variant="outline" className={cn("text-[10px]", statusCfg.className)}>
                {statusCfg.label}
              </Badge>
              {request.priority === "viktig" && (
                <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent border-accent/20">
                  Viktig
                </Badge>
              )}
              {hasImage && <ImageIcon className="h-3 w-3 text-muted-foreground" />}
              {request.ai_confidence != null && (
                <span className="text-[10px] text-muted-foreground">
                  {request.ai_confidence}% sikkerhet
                </span>
              )}
            </div>
            <p className="text-sm font-medium truncate">{firstLine}</p>
            {request.ai_summary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{request.ai_summary}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(request.created_at), "d. MMM HH:mm", { locale: nb })}
            </span>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border/40">
          {/* Full question */}
          <div className="p-5 border-b border-border/40">
            <p className="text-xs font-medium text-muted-foreground mb-1">Spørsmål</p>
            <p className="text-sm whitespace-pre-wrap">{request.question}</p>
          </div>

          {/* Image preview */}
          {hasImage && (
            <div className="p-5 border-b border-border/40">
              <p className="text-xs font-medium text-muted-foreground mb-2">Vedlagt bilde</p>
              <FagImagePreview path={request.image_paths[0]} />
            </div>
          )}

          {/* AI Answer */}
          {request.status === "analyzing" && (
            <div className="p-5 flex items-center gap-2 text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">AI analyserer forespørselen…</span>
            </div>
          )}

          {request.status === "error" && (
            <div className="p-5 flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">Analysen feilet. Prøv igjen senere.</span>
            </div>
          )}

          {answers.length > 0 && (
            <div className="p-5 border-b border-border/40">
              <p className="text-xs font-medium text-muted-foreground mb-3">AI-svar</p>
              <div className="prose prose-sm max-w-none text-foreground">
                <MarkdownRenderer content={answers[0].answer_markdown} />
              </div>
              {answers[0].model && (
                <p className="text-[10px] text-muted-foreground mt-3">
                  Modell: {answers[0].model} · {format(new Date(answers[0].created_at), "d. MMM HH:mm", { locale: nb })}
                </p>
              )}
            </div>
          )}

          {/* Followup questions */}
          {request.ai_followup_questions.length > 0 && (
            <div className="p-5">
              <p className="text-xs font-medium text-muted-foreground mb-2">Oppfølgingsspørsmål</p>
              <div className="flex flex-wrap gap-2">
                {request.ai_followup_questions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => onFollowupClick(q)}
                    className="px-3 py-1.5 rounded-full text-xs bg-primary/5 text-primary border border-primary/20 hover:bg-primary/10 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="px-5 py-3 bg-muted/30">
            <p className="text-[11px] text-muted-foreground italic">
              ⚠️ AI gir veiledning basert på kjente prinsipper. Original forskrift må alltid sjekkes ved tvil.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function FagImagePreview({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.storage.from("fag-attachments").createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [path]);

  if (!url) return <div className="h-32 w-32 rounded-lg bg-muted animate-pulse" />;
  return <img src={url} alt="Vedlagt bilde" className="max-h-64 rounded-lg border border-border object-contain" />;
}

function MarkdownRenderer({ content }: { content: string }) {
  // Simple markdown to HTML: headings, lists, bold, italic, hr
  const html = content
    .replace(/^### (.+)$/gm, '<h4 class="text-sm font-semibold mt-3 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="text-sm font-bold mt-4 mb-2 text-primary">$1</h3>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^⚠️ (.+)$/gm, '<p class="text-sm text-accent flex items-start gap-1.5"><span class="shrink-0">⚠️</span>$1</p>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-muted-foreground">$1</em>')
    .replace(/^---$/gm, '<hr class="my-3 border-border/40" />')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function regimeChipClass(regime: string): string {
  switch (regime) {
    case "nek": return "bg-primary/10 text-primary border-primary/20";
    case "fel": return "bg-accent/10 text-accent border-accent/20";
    case "fse": return "bg-destructive/10 text-destructive border-destructive/20";
    case "fsl": return "bg-success/10 text-success border-success/20";
    default: return "bg-muted text-muted-foreground border-border";
  }
}
