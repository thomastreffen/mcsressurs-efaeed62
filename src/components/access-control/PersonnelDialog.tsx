import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, Upload, FileText, AlertTriangle, Trash2, Archive, ArchiveRestore, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays, format } from "date-fns";

interface TechnicianProfile {
  id: string;
  name: string;
  email: string;
  is_plannable_resource: boolean;
  birth_date: string | null;
  hms_card_number: string | null;
  hms_card_expires_at: string | null;
  trade_certificate_type: string | null;
  driver_license_classes: string | null;
  notes: string | null;
  archived_at: string | null;
  archived_by: string | null;
}

interface UserDocument {
  id: string;
  category: string;
  doc_type: string;
  file_name: string;
  file_path: string;
  expires_at: string | null;
  created_at: string;
  extracted_fields_json: Record<string, any> | null;
  confirmed_fields_json: Record<string, any> | null;
  confidence_json: Record<string, number> | null;
  confirmed_at: string | null;
  ai_processed_at: string | null;
}

const DOC_CATEGORIES = [
  { value: "identification", label: "Identifikasjon" },
  { value: "hms", label: "HMS-kort" },
  { value: "certificate", label: "Fagbrev" },
  { value: "course", label: "Kurs" },
  { value: "contract", label: "Kontrakt" },
  { value: "other", label: "Annet" },
] as const;

function getCategoryLabel(value: string) {
  return DOC_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

const FIELD_LABELS: Record<string, string> = {
  full_name: "Fullt navn",
  hms_card_number: "HMS-kortnummer",
  expires_at: "Utløpsdato",
  trade_type: "Fagbrevtype",
  issue_year: "Utstedelsesår",
  course_name: "Kursnavn",
  birth_date: "Fødselsdato",
  license_classes: "Førerkortklasser",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  hms_card: "HMS-kort",
  trade_certificate: "Fagbrev",
  course_certificate: "Kursbevis",
  driver_license: "Førerkort",
  unknown: "Ukjent",
};

interface AiReviewState {
  documentId: string;
  filePath: string;
  fileName: string;
  docType: string;
  extractedFields: Record<string, any>;
  confidence: Record<string, number>;
  warnings: string[];
  editedFields: Record<string, any>;
}

interface PersonnelDialogProps {
  technicianId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function PersonnelDialog({ technicianId, open, onOpenChange, onSaved }: PersonnelDialogProps) {
  const [profile, setProfile] = useState<TechnicianProfile | null>(null);
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("other");
  const [uploadExpiry, setUploadExpiry] = useState("");
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiReview, setAiReview] = useState<AiReviewState | null>(null);
  const [confirmingSave, setConfirmingSave] = useState(false);

  const fetchData = useCallback(async () => {
    if (!technicianId) return;
    setLoading(true);
    const [techRes, docsRes] = await Promise.all([
      supabase
        .from("technicians")
        .select("id, name, email, is_plannable_resource, birth_date, hms_card_number, hms_card_expires_at, trade_certificate_type, driver_license_classes, notes, archived_at, archived_by")
        .eq("id", technicianId)
        .single(),
      supabase
        .from("user_documents")
        .select("id, category, doc_type, file_name, file_path, expires_at, created_at, extracted_fields_json, confirmed_fields_json, confidence_json, confirmed_at, ai_processed_at")
        .eq("user_id", technicianId)
        .order("created_at", { ascending: false }),
    ]);
    if (techRes.data) setProfile(techRes.data as any);
    setDocuments((docsRes.data as any[]) || []);
    setLoading(false);
  }, [technicianId]);

  useEffect(() => {
    if (open && technicianId) {
      fetchData();
      setAiReview(null);
    }
  }, [open, technicianId, fetchData]);

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("technicians")
      .update({
        is_plannable_resource: profile.is_plannable_resource,
        birth_date: profile.birth_date || null,
        hms_card_number: profile.hms_card_number || null,
        hms_card_expires_at: profile.hms_card_expires_at || null,
        trade_certificate_type: profile.trade_certificate_type || null,
        driver_license_classes: profile.driver_license_classes || null,
        notes: profile.notes || null,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error("Feil ved lagring", { description: error.message });
    } else {
      toast.success("Profil oppdatert");
      onSaved();
    }
  };

  const handleArchiveToggle = async () => {
    if (!profile) return;
    setSaving(true);
    const isArchived = !!profile.archived_at;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("technicians")
      .update({
        archived_at: isArchived ? null : new Date().toISOString(),
        archived_by: isArchived ? null : user?.id || null,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error("Feil ved arkivering", { description: error.message });
    } else {
      toast.success(isArchived ? "Bruker gjenopprettet" : "Bruker arkivert");
      onSaved();
      onOpenChange(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploading(true);
    const path = `${profile.id}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
    const { error: uploadError } = await supabase.storage
      .from("user-documents")
      .upload(path, file);
    if (uploadError) {
      toast.error("Opplasting feilet", { description: uploadError.message });
      setUploading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { data: insertData, error: insertError } = await supabase
      .from("user_documents")
      .insert({
        user_id: profile.id,
        category: uploadCategory,
        file_name: file.name,
        file_path: path,
        expires_at: uploadExpiry || null,
        uploaded_by: user?.id || null,
      })
      .select("id")
      .single();
    setUploading(false);
    if (insertError || !insertData) {
      toast.error("Feil ved registrering", { description: insertError?.message });
    } else {
      toast.success("Dokument lastet opp");
      setUploadExpiry("");
      // Trigger AI extraction
      triggerAiExtraction(insertData.id, path, file.name);
      fetchData();
    }
    e.target.value = "";
  };

  const triggerAiExtraction = async (documentId: string, filePath: string, fileName: string) => {
    setAiProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-user-document", {
        body: { document_id: documentId, file_path: filePath },
      });
      if (error) {
        console.error("AI extraction error:", error);
        toast.error("AI-analyse feilet", { description: "Dokumentet ble lagret, men AI kunne ikke analysere det." });
        setAiProcessing(false);
        return;
      }
      if (data?.error) {
        toast.error("AI-analyse feilet", { description: data.error });
        setAiProcessing(false);
        return;
      }
      // Show AI review panel
      setAiReview({
        documentId,
        filePath,
        fileName,
        docType: data.doc_type || "unknown",
        extractedFields: data.extracted_fields || {},
        confidence: data.confidence || {},
        warnings: data.warnings || [],
        editedFields: { ...data.extracted_fields },
      });
      fetchData();
    } catch (err) {
      console.error("AI extraction error:", err);
      toast.error("AI-analyse feilet");
    }
    setAiProcessing(false);
  };

  const handleConfirmAi = async () => {
    if (!aiReview || !profile) return;
    setConfirmingSave(true);
    const { data: { user } } = await supabase.auth.getUser();
    const fields = aiReview.editedFields;

    // Save confirmed fields to user_documents
    await supabase.from("user_documents").update({
      confirmed_fields_json: fields,
      confirmed_by: user?.id || null,
      confirmed_at: new Date().toISOString(),
      doc_type: aiReview.docType,
      expires_at: fields.expires_at || null,
    }).eq("id", aiReview.documentId);

    // Update technician profile based on doc_type
    const techUpdate: Record<string, any> = {};
    if (aiReview.docType === "hms_card") {
      if (fields.hms_card_number) techUpdate.hms_card_number = fields.hms_card_number;
      if (fields.expires_at) techUpdate.hms_card_expires_at = fields.expires_at;
    } else if (aiReview.docType === "trade_certificate") {
      if (fields.trade_type) techUpdate.trade_certificate_type = fields.trade_type;
    } else if (aiReview.docType === "driver_license") {
      if (fields.birth_date) techUpdate.birth_date = fields.birth_date;
      if (fields.license_classes) techUpdate.driver_license_classes = fields.license_classes;
    }

    if (Object.keys(techUpdate).length > 0) {
      await supabase.from("technicians").update(techUpdate).eq("id", profile.id);
    }

    setConfirmingSave(false);
    toast.success("AI-forslag bekreftet og lagret");
    setAiReview(null);
    fetchData();
    onSaved();
  };

  const handleDeleteDoc = async (doc: UserDocument) => {
    await supabase.storage.from("user-documents").remove([doc.file_path]);
    await supabase.from("user_documents").delete().eq("id", doc.id);
    toast.success("Dokument slettet");
    fetchData();
  };

  const getExpiryBadge = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const daysLeft = differenceInDays(new Date(expiresAt), new Date());
    if (daysLeft < 0) return <Badge variant="destructive" className="text-[10px]">Utløpt</Badge>;
    if (daysLeft <= 30) return <Badge variant="destructive" className="text-[10px] bg-status-requested/20 text-status-requested border-status-requested/30"><AlertTriangle className="h-3 w-3 mr-0.5" />Utløper om {daysLeft}d</Badge>;
    return <Badge variant="outline" className="text-[10px]">{format(new Date(expiresAt), "dd.MM.yyyy")}</Badge>;
  };

  const getConfidenceBadge = (score: number) => {
    if (score >= 80) return <Badge variant="success" className="text-[10px]">{score}%</Badge>;
    if (score >= 50) return <Badge variant="warning" className="text-[10px]">{score}%</Badge>;
    return <Badge variant="destructive" className="text-[10px]">{score}%</Badge>;
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={aiReview ? "max-w-2xl max-h-[90vh]" : "max-w-lg max-h-[85vh]"}>
        <DialogHeader>
          <DialogTitle>{profile?.name || "Bruker"} – Personalmappe</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : aiReview ? (
          /* AI Review Panel */
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">AI-forslag – {DOC_TYPE_LABELS[aiReview.docType] || aiReview.docType}</p>
                <p className="text-xs text-muted-foreground">Gjennomgå og korriger feltene før du bekrefter.</p>
              </div>
            </div>

            {aiReview.warnings.length > 0 && (
              <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 space-y-1">
                {aiReview.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}

            <div className="text-xs text-muted-foreground px-1">
              Fil: <span className="font-medium text-foreground">{aiReview.fileName}</span>
            </div>

            <ScrollArea className="h-[340px] pr-2">
              <div className="space-y-3">
                {Object.entries(aiReview.extractedFields).map(([key, value]) => {
                  const confidence = aiReview.confidence[key] ?? 0;
                  const isLowConfidence = confidence < 60;
                  return (
                    <div key={key} className={`rounded-lg border p-3 space-y-1.5 ${isLowConfidence ? "border-destructive/30 bg-destructive/5" : "border-border"}`}>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">{FIELD_LABELS[key] || key}</Label>
                        {getConfidenceBadge(confidence)}
                      </div>
                      <Input
                        value={aiReview.editedFields[key] ?? ""}
                        onChange={(e) => setAiReview({
                          ...aiReview,
                          editedFields: { ...aiReview.editedFields, [key]: e.target.value },
                        })}
                        className={`text-sm ${isLowConfidence ? "border-destructive/40" : ""}`}
                        type={key.includes("date") || key === "expires_at" ? "date" : "text"}
                      />
                      {isLowConfidence && (
                        <p className="text-[10px] text-destructive">Lav konfidens – verifiser manuelt</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setAiReview(null)}>
                <XCircle className="h-4 w-4 mr-1" />Avbryt
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                toast.success("Dokument lagret uten AI-forslag");
                setAiReview(null);
              }}>
                Lagre uten AI
              </Button>
              <Button size="sm" onClick={handleConfirmAi} disabled={confirmingSave}>
                {confirmingSave ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Bekreft og lagre
              </Button>
            </div>
          </div>
        ) : aiProcessing ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyserer dokument med AI...</p>
            <p className="text-xs text-muted-foreground/60">Dette kan ta noen sekunder</p>
          </div>
        ) : profile ? (
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="info" className="flex-1">Personalia</TabsTrigger>
              <TabsTrigger value="docs" className="flex-1">Dokumenter</TabsTrigger>
            </TabsList>

            <TabsContent value="info">
              <ScrollArea className="h-[420px] pr-3">
                <div className="space-y-4 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Planleggbar ressurs</Label>
                      <p className="text-[11px] text-muted-foreground">Vises i ressursplanen</p>
                    </div>
                    <Switch
                      checked={profile.is_plannable_resource}
                      onCheckedChange={(v) => setProfile({ ...profile, is_plannable_resource: v })}
                    />
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Fødselsdato</Label>
                      <Input type="date" value={profile.birth_date || ""} onChange={(e) => setProfile({ ...profile, birth_date: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">HMS-kortnummer</Label>
                      <Input value={profile.hms_card_number || ""} onChange={(e) => setProfile({ ...profile, hms_card_number: e.target.value })} placeholder="Kortnr." />
                    </div>
                    <div>
                      <Label className="text-xs">HMS-kort utløper</Label>
                      <Input type="date" value={profile.hms_card_expires_at || ""} onChange={(e) => setProfile({ ...profile, hms_card_expires_at: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Fagbrev-type</Label>
                      <Input value={profile.trade_certificate_type || ""} onChange={(e) => setProfile({ ...profile, trade_certificate_type: e.target.value })} placeholder="F.eks. Elektriker" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Førerkortklasser</Label>
                    <Input value={profile.driver_license_classes || ""} onChange={(e) => setProfile({ ...profile, driver_license_classes: e.target.value })} placeholder="F.eks. B, BE, C1" />
                  </div>

                  <div>
                    <Label className="text-xs">Notater</Label>
                    <Textarea value={profile.notes || ""} onChange={(e) => setProfile({ ...profile, notes: e.target.value })} rows={3} placeholder="Interne notater om ansatt..." />
                  </div>

                  {profile.hms_card_expires_at && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">HMS-kort:</span>
                      {getExpiryBadge(profile.hms_card_expires_at)}
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center justify-between rounded-lg border border-destructive/20 p-3">
                    <div>
                      <p className="text-sm font-medium">{profile.archived_at ? "Bruker er arkivert" : "Arkiver bruker"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {profile.archived_at ? "Skjult fra ressursplan og aktive lister" : "Skjuler brukeren fra alle aktive lister"}
                      </p>
                    </div>
                    <Button variant={profile.archived_at ? "outline" : "destructive"} size="sm" onClick={handleArchiveToggle} disabled={saving}>
                      {profile.archived_at ? <><ArchiveRestore className="h-4 w-4 mr-1" />Gjenopprett</> : <><Archive className="h-4 w-4 mr-1" />Arkiver</>}
                    </Button>
                  </div>
                </div>
              </ScrollArea>
              <DialogFooter className="mt-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
                <Button onClick={handleSaveProfile} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre"}
                </Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="docs">
              <ScrollArea className="h-[420px] pr-3">
                <div className="space-y-4 py-2">
                  {/* Upload section */}
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last opp dokument</p>
                      <Badge variant="default" className="text-[9px]"><Sparkles className="h-2.5 w-2.5 mr-0.5" />AI-analyse</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Kategori</Label>
                        <Select value={uploadCategory} onValueChange={setUploadCategory}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {DOC_CATEGORIES.map((c) => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Utløpsdato (valgfritt)</Label>
                        <Input type="date" value={uploadExpiry} onChange={(e) => setUploadExpiry(e.target.value)} />
                      </div>
                    </div>
                    <label className="flex items-center justify-center gap-2 rounded-md border-2 border-dashed p-3 cursor-pointer hover:bg-accent/50 transition-colors">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
                      <span className="text-sm text-muted-foreground">{uploading ? "Laster opp..." : "Velg fil (AI analyserer automatisk)"}</span>
                      <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                    </label>
                  </div>

                  <Separator />

                  {/* Document list */}
                  {DOC_CATEGORIES.map((cat) => {
                    const catDocs = documents.filter((d) => d.category === cat.value);
                    if (catDocs.length === 0) return null;
                    return (
                      <div key={cat.value}>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{cat.label}</p>
                        <div className="space-y-1">
                          {catDocs.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-sm truncate">{doc.file_name}</span>
                                {getExpiryBadge(doc.expires_at)}
                                {doc.confirmed_at && (
                                  <Badge variant="success" className="text-[9px]"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Bekreftet</Badge>
                                )}
                                {doc.ai_processed_at && !doc.confirmed_at && (
                                  <Badge variant="default" className="text-[9px] cursor-pointer" onClick={() => {
                                    if (doc.extracted_fields_json) {
                                      setAiReview({
                                        documentId: doc.id,
                                        filePath: doc.file_path,
                                        fileName: doc.file_name,
                                        docType: doc.doc_type || "unknown",
                                        extractedFields: doc.extracted_fields_json,
                                        confidence: doc.confidence_json || {},
                                        warnings: [],
                                        editedFields: { ...doc.extracted_fields_json },
                                      });
                                    }
                                  }}>
                                    <Sparkles className="h-2.5 w-2.5 mr-0.5" />Se AI-forslag
                                  </Badge>
                                )}
                              </div>
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDeleteDoc(doc)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {documents.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">Ingen dokumenter lastet opp ennå.</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center">Fant ikke brukerdata.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
