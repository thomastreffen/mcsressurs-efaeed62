import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, ArrowRight, Check, Loader2, Upload, X, FileText, Image as ImageIcon,
  Building2, FileEdit, Paperclip, Brain, Package, Sparkles, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  { label: "Kunde & prosjekt", icon: Building2 },
  { label: "Beskrivelse", icon: FileEdit },
  { label: "Dokumenter", icon: Paperclip },
  { label: "AI-analyse", icon: Brain },
  { label: "Kalkyle", icon: Package },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function NewCalculation() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [calcId, setCalcId] = useState<string | null>(null);

  // Step 1
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [projectTitle, setProjectTitle] = useState("");

  // Step 2
  const [description, setDescription] = useState("");

  // Step 3
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedAttachments, setUploadedAttachments] = useState<{ name: string; url: string; size: number }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Step 4
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [settings, setSettings] = useState({ material_multiplier: 2.0, default_hour_rate: 1080 });

  useEffect(() => {
    supabase.from("settings").select("key, value").then(({ data }) => {
      if (data) {
        const s: any = { material_multiplier: 2.0, default_hour_rate: 1080 };
        data.forEach((row: any) => {
          if (row.key === "material_multiplier") s.material_multiplier = Number(row.value);
          if (row.key === "default_hour_rate") s.default_hour_rate = Number(row.value);
        });
        setSettings(s);
      }
    });
  }, []);

  const progress = ((step + 1) / STEPS.length) * 100;

  const saveCalculation = useCallback(async () => {
    if (calcId) return calcId;
    if (!customerName.trim() || !projectTitle.trim()) {
      toast.error("Kundenavn og prosjekttittel er påkrevd");
      return null;
    }
    setSaving(true);
    const { data, error } = await supabase.from("calculations").insert({
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim() || null,
      project_title: projectTitle.trim(),
      description: description.trim() || null,
      created_by: user!.id,
    }).select("id").single();
    setSaving(false);
    if (error) {
      toast.error("Kunne ikke opprette", { description: error.message });
      return null;
    }
    setCalcId(data.id);
    return data.id;
  }, [calcId, customerName, customerEmail, projectTitle, description, user]);

  const updateDescription = useCallback(async () => {
    if (!calcId) return;
    await supabase.from("calculations").update({ description: description.trim() || null }).eq("id", calcId);
  }, [calcId, description]);

  const handleNext = async () => {
    if (step === 0) {
      if (!customerName.trim() || !projectTitle.trim()) {
        toast.error("Kundenavn og prosjekttittel er påkrevd");
        return;
      }
      const id = await saveCalculation();
      if (!id) return;
    }
    if (step === 1) {
      await updateDescription();
    }
    if (step === 2) {
      await uploadFiles();
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const uploadFiles = async () => {
    if (files.length === 0 || !calcId) return;
    setUploading(true);
    const newAttachments: typeof uploadedAttachments = [];
    for (const file of files) {
      const path = `${calcId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("calculation-attachments").upload(path, file);
      if (error) {
        toast.error(`Feil ved opplasting: ${file.name}`);
        continue;
      }
      const { data: urlData } = supabase.storage.from("calculation-attachments").getPublicUrl(path);
      newAttachments.push({ name: file.name, url: urlData.publicUrl, size: file.size });
    }
    const all = [...uploadedAttachments, ...newAttachments];
    setUploadedAttachments(all);
    setFiles([]);
    await supabase.from("calculations").update({ attachments: all }).eq("id", calcId);
    setUploading(false);
    if (newAttachments.length > 0) toast.success(`${newAttachments.length} filer lastet opp`);
  };

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []).filter((f) => {
      if (f.size > MAX_FILE_SIZE) { toast.error(`${f.name} er for stor (maks 10 MB)`); return false; }
      return true;
    });
    setFiles((prev) => [...prev, ...newFiles]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleAiAnalyse = async () => {
    if (!calcId) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-calculation-ai", {
        body: {
          description,
          project_title: projectTitle,
          customer_name: customerName,
          material_multiplier: settings.material_multiplier,
          hour_rate: settings.default_hour_rate,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setAiResult(data);
      await supabase.from("calculations").update({ ai_analysis: data }).eq("id", calcId);

      // If AI returned actual items (not insufficient_data), insert them
      if (data.status !== "insufficient_data" && (data.materials?.length || data.labor?.length)) {
        await supabase.from("calculation_items").delete().eq("calculation_id", calcId).eq("suggested_by_ai", true);
        const newItems: any[] = [];
        for (const m of (data.materials || [])) {
          const sellPrice = (m.unit_price || 0) * settings.material_multiplier;
          newItems.push({
            calculation_id: calcId, type: "material", title: m.title, description: m.description || null,
            quantity: m.quantity || 1, unit: m.unit || "stk", unit_price: sellPrice,
            total_price: sellPrice * (m.quantity || 1), suggested_by_ai: true,
          });
        }
        for (const l of (data.labor || [])) {
          newItems.push({
            calculation_id: calcId, type: "labor", title: l.title, description: l.description || null,
            quantity: l.hours || 1, unit: "timer", unit_price: settings.default_hour_rate,
            total_price: (l.hours || 1) * settings.default_hour_rate, suggested_by_ai: true,
          });
        }
        if (newItems.length > 0) await supabase.from("calculation_items").insert(newItems);
        const { data: allItems } = await supabase.from("calculation_items").select("*").eq("calculation_id", calcId);
        if (allItems) {
          const totalMaterial = allItems.filter((i: any) => i.type === "material").reduce((s: number, i: any) => s + i.total_price, 0);
          const totalLabor = allItems.filter((i: any) => i.type === "labor").reduce((s: number, i: any) => s + i.total_price, 0);
          await supabase.from("calculations").update({ total_material: totalMaterial, total_labor: totalLabor, total_price: totalMaterial + totalLabor }).eq("id", calcId);
        }
        toast.success("AI-analyse fullført", { description: `${newItems.length} poster generert` });
      }
    } catch (err: any) {
      toast.error("AI-analyse feilet", { description: err.message || "Ukjent feil" });
    }
    setAiLoading(false);
  };

  const confidenceColor = (level: string) => {
    if (level === "high") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (level === "medium") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  };

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/sales/calculations")} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Tilbake
      </Button>

      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Ny kalkulasjon</h1>
        <p className="text-sm text-muted-foreground mt-1">Steg {step + 1} av {STEPS.length} — {STEPS[step].label}</p>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between">
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => { if (i <= step || calcId) setStep(i); }}
              className={`flex items-center gap-1 text-xs transition-colors ${i <= step ? "text-primary font-medium" : "text-muted-foreground"} ${i <= step || calcId ? "cursor-pointer" : "cursor-default"}`}
            >
              {i < step ? <Check className="h-3 w-3" /> : <s.icon className="h-3 w-3" />}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="rounded-lg border bg-card p-6 min-h-[300px]">
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Kundenavn *</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Firma eller person" />
            </div>
            <div className="space-y-1.5">
              <Label>Kunde e-post</Label>
              <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="epost@eksempel.no" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label>Prosjekttittel *</Label>
              <Input value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder="Beskrivende tittel for prosjektet" />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Arbeidsbeskrivelse</Label>
              <p className="text-xs text-muted-foreground">Jo mer detaljert du beskriver arbeidet, desto bedre blir AI-analysen. Inkluder type jobb, omfang, spesifikasjoner og eventuelle spesielle forhold.</p>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Beskriv arbeidet som skal utføres i detalj..." rows={10} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-1">Dokumenter og grunnlag</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Last opp bilder, PDF-er, tegninger, Excel eller Word-dokumenter som grunnlag for kalkulasjonen.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} className="gap-1.5">
                <Upload className="h-3.5 w-3.5" /> Velg filer
              </Button>
              <span className="text-xs text-muted-foreground">Maks 10 MB per fil</span>
            </div>
            <input ref={inputRef} type="file" multiple onChange={handleAddFiles} className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf" />

            {uploadedAttachments.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Opplastede filer</p>
                {uploadedAttachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md bg-secondary px-2.5 py-1.5 text-sm">
                    {/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(att.name) ? <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <span className="truncate flex-1">{att.name}</span>
                    <span className="text-xs text-muted-foreground">{(att.size / 1024).toFixed(0)} KB</span>
                  </div>
                ))}
              </div>
            )}

            {files.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Klare for opplasting</p>
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md bg-accent px-2.5 py-1.5 text-sm">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {files.length === 0 && uploadedAttachments.length === 0 && (
              <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Ingen filer lastet opp ennå</p>
                <p className="text-xs">Du kan fortsette uten vedlegg</p>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {!aiResult ? (
              <div className="text-center space-y-4 py-4">
                <Sparkles className="h-12 w-12 mx-auto text-primary opacity-60" />
                <div>
                  <h3 className="text-lg font-medium">AI-assistert analyse</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                    AI analyserer beskrivelsen og foreslår materialer, arbeidstimer og risikofaktorer basert på faglig kunnskap.
                  </p>
                </div>
                {!description?.trim() && (
                  <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 p-3 text-sm text-orange-800 dark:text-orange-200 flex items-start gap-2 max-w-md mx-auto">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Legg til en arbeidsbeskrivelse i steg 2 for bedre AI-analyse.</span>
                  </div>
                )}
                <Button onClick={handleAiAnalyse} disabled={aiLoading || !description?.trim()} className="gap-1.5">
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Kjør AI-analyse
                </Button>
              </div>
            ) : aiResult.status === "insufficient_data" ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-medium text-orange-800 dark:text-orange-200">Mer informasjon kreves</h3>
                      <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">AI kan ikke generere en realistisk kalkyle uten ytterligere informasjon.</p>
                    </div>
                  </div>
                  {aiResult.missing_information?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-orange-800 dark:text-orange-200 mb-1">Manglende informasjon:</p>
                      <ul className="text-sm space-y-0.5 text-orange-700 dark:text-orange-300">
                        {aiResult.missing_information.map((info: string, i: number) => (
                          <li key={i} className="flex gap-2"><span>•</span><span>{info}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiResult.clarifying_questions?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-orange-800 dark:text-orange-200 mb-1">Oppfølgingsspørsmål:</p>
                      <ul className="text-sm space-y-0.5 text-orange-700 dark:text-orange-300">
                        {aiResult.clarifying_questions.map((q: string, i: number) => (
                          <li key={i} className="flex gap-2"><span>❓</span><span>{q}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setStep(1); setAiResult(null); }} className="gap-1.5">
                    <ArrowLeft className="h-4 w-4" /> Oppdater beskrivelse
                  </Button>
                  <Button variant="outline" onClick={() => setAiResult(null)} className="gap-1.5">
                    <Sparkles className="h-4 w-4" /> Prøv på nytt
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {aiResult.confidence_level && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Konfidensnivå:</span>
                    <Badge className={confidenceColor(aiResult.confidence_level)}>{aiResult.confidence_level === "high" ? "Høy" : aiResult.confidence_level === "medium" ? "Middels" : "Lav"}</Badge>
                    {aiResult.requires_manual_review && <Badge variant="outline" className="text-xs">Krever manuell gjennomgang</Badge>}
                  </div>
                )}
                <div className="rounded-lg border bg-card p-4 space-y-2">
                  <h3 className="text-sm font-medium">Oppsummering</h3>
                  <p className="text-sm text-muted-foreground">{aiResult.job_summary}</p>
                  {aiResult.job_type && <Badge variant="outline">{aiResult.job_type}</Badge>}
                </div>
                {aiResult.assumptions?.length > 0 && (
                  <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-4 space-y-2">
                    <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">📋 Forutsetninger</h3>
                    <ul className="text-sm space-y-0.5 text-blue-700 dark:text-blue-300">
                      {aiResult.assumptions.map((a: string, i: number) => <li key={i} className="flex gap-2"><span>•</span><span>{a}</span></li>)}
                    </ul>
                  </div>
                )}
                {aiResult.risk_notes?.length > 0 && (
                  <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 p-4 space-y-2">
                    <h3 className="text-sm font-medium text-orange-800 dark:text-orange-200">⚠ Risikovurdering</h3>
                    <ul className="text-sm space-y-0.5 text-orange-700 dark:text-orange-300">
                      {aiResult.risk_notes.map((note: string, i: number) => <li key={i} className="flex gap-2"><span>•</span><span>{note}</span></li>)}
                    </ul>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {aiResult.estimated_duration_days && (
                    <div className="rounded-lg border bg-card p-3">
                      <p className="text-xs text-muted-foreground">Estimert varighet</p>
                      <p className="text-lg font-bold">{aiResult.estimated_duration_days} dager</p>
                    </div>
                  )}
                  {aiResult.recommended_technicians && (
                    <div className="rounded-lg border bg-card p-3">
                      <p className="text-xs text-muted-foreground">Anbefalt montører</p>
                      <p className="text-lg font-bold">{aiResult.recommended_technicians} stk</p>
                    </div>
                  )}
                </div>
                <Button onClick={() => setStep(4)} className="gap-1.5">
                  <ArrowRight className="h-4 w-4" /> Gå til kalkyle
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="text-center space-y-4 py-8">
            <Check className="h-12 w-12 mx-auto text-primary" />
            <div>
              <h3 className="text-lg font-medium">Kalkulasjon opprettet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Gå til kalkulasjonsdetaljer for å gjennomgå og redigere kalkylelinjer, generere tilbud og konvertere til prosjekt.
              </p>
            </div>
            <Button onClick={() => navigate(`/sales/calculations/${calcId}`)} className="gap-1.5">
              Åpne kalkulasjon <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      {step < 4 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Forrige
          </Button>
          {step === 3 ? (
            aiResult && aiResult.status !== "insufficient_data" && (
              <Button onClick={() => setStep(4)} className="gap-1.5">
                Fullfør <Check className="h-4 w-4" />
              </Button>
            )
          ) : (
            <Button onClick={handleNext} disabled={saving || uploading}>
              {(saving || uploading) && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {step === 2 && files.length > 0 ? "Last opp & neste" : "Neste"} <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
