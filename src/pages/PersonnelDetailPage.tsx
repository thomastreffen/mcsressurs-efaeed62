import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Upload, FileText, AlertTriangle, Trash2,
  Archive, ArchiveRestore, Sparkles, CheckCircle2, XCircle,
  ArrowLeft, User, FolderOpen, GraduationCap,
} from "lucide-react";
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

export default function PersonnelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<TechnicianProfile | null>(null);
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("other");
  const [uploadExpiry, setUploadExpiry] = useState("");
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiReview, setAiReview] = useState<AiReviewState | null>(null);
  const [confirmingSave, setConfirmingSave] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [techRes, docsRes] = await Promise.all([
      supabase
        .from("technicians")
        .select("id, name, email, is_plannable_resource, birth_date, hms_card_number, hms_card_expires_at, trade_certificate_type, driver_license_classes, notes, archived_at, archived_by")
        .eq("id", id)
        .single(),
      supabase
        .from("user_documents")
        .select("id, category, doc_type, file_name, file_path, expires_at, created_at, extracted_fields_json, confirmed_fields_json, confidence_json, confirmed_at, ai_processed_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
    ]);
    if (techRes.data) setProfile(techRes.data as any);
    setDocuments((docsRes.data as any[]) || []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      fetchData();
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
      triggerAiExtraction(insertData.id, path, file.name);
      fetchData();
    }
    e.target.value = "";
  };

  const triggerAiExtraction = async (documentId: string, filePath: string, fileName: string) => {
    setAiProcessing(true);
    setSelectedDocId(documentId);
    try {
      const { data, error } = await supabase.functions.invoke("extract-user-document", {
        body: { document_id: documentId, file_path: filePath },
      });
      if (error || data?.error) {
        toast.error("AI-analyse feilet", { description: data?.error || "Dokumentet ble lagret, men AI kunne ikke analysere det." });
        setAiProcessing(false);
        return;
      }
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

  const handleConfirmAiAndUpdateProfile = async () => {
    if (!aiReview || !profile) return;
    setConfirmingSave(true);
    const { data: { user } } = await supabase.auth.getUser();
    const fields = aiReview.editedFields;

    await supabase.from("user_documents").update({
      confirmed_fields_json: fields,
      confirmed_by: user?.id || null,
      confirmed_at: new Date().toISOString(),
      doc_type: aiReview.docType,
      expires_at: fields.expires_at || null,
    }).eq("id", aiReview.documentId);

    const techUpdate: Record<string, any> = {};
    if (aiReview.docType === "hms_card") {
      if (fields.hms_card_number) techUpdate.hms_card_number = fields.hms_card_number;
      if (fields.expires_at) techUpdate.hms_card_expires_at = fields.expires_at;
    } else if (aiReview.docType === "trade_certificate") {
      if (fields.trade_type) techUpdate.trade_certificate_type = fields.trade_type;
    } else if (aiReview.docType === "driver_license") {
      if (fields.birth_date) techUpdate.birth_date = fields.birth_date;
      if (fields.license_classes) techUpdate.driver_license_classes = fields.license_classes;
    } else if (aiReview.docType === "course_certificate") {
      // no profile fields to update
    }
    if (Object.keys(techUpdate).length > 0) {
      await supabase.from("technicians").update(techUpdate).eq("id", profile.id);
    }

    setConfirmingSave(false);
    toast.success("AI-forslag bekreftet og lagret til profil");
    setAiReview(null);
    setSelectedDocId(null);
    fetchData();
  };

  const handleConfirmWithoutProfile = async () => {
    if (!aiReview) return;
    setConfirmingSave(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("user_documents").update({
      confirmed_fields_json: aiReview.editedFields,
      confirmed_by: user?.id || null,
      confirmed_at: new Date().toISOString(),
      doc_type: aiReview.docType,
    }).eq("id", aiReview.documentId);
    setConfirmingSave(false);
    toast.success("Lagret uten å oppdatere profil");
    setAiReview(null);
    setSelectedDocId(null);
    fetchData();
  };

  const handleRejectAi = async () => {
    if (!aiReview) return;
    await supabase.from("user_documents").update({
      confirmed_fields_json: {},
      confirmed_at: new Date().toISOString(),
    }).eq("id", aiReview.documentId);
    toast.success("AI-forslag avvist");
    setAiReview(null);
    setSelectedDocId(null);
    fetchData();
  };

  const handleDeleteDoc = async (doc: UserDocument) => {
    await supabase.storage.from("user-documents").remove([doc.file_path]);
    await supabase.from("user_documents").delete().eq("id", doc.id);
    toast.success("Dokument slettet");
    if (selectedDocId === doc.id) {
      setAiReview(null);
      setSelectedDocId(null);
    }
    fetchData();
  };

  const openDocReview = (doc: UserDocument) => {
    setSelectedDocId(doc.id);
    if (doc.extracted_fields_json && doc.ai_processed_at && !doc.confirmed_at) {
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
    } else {
      setAiReview(null);
    }
  };

  const getExpiryBadge = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const daysLeft = differenceInDays(new Date(expiresAt), new Date());
    if (daysLeft < 0) return <Badge variant="destructive" className="text-[10px]">Utløpt</Badge>;
    if (daysLeft <= 30) return <Badge variant="destructive" className="text-[10px]"><AlertTriangle className="h-3 w-3 mr-0.5" />Utløper om {daysLeft}d</Badge>;
    return <Badge variant="outline" className="text-[10px]">{format(new Date(expiresAt), "dd.MM.yyyy")}</Badge>;
  };

  const getConfidenceLabel = (score: number) => {
    if (score >= 80) return { label: "Høy", variant: "success" as const };
    if (score >= 50) return { label: "Middels", variant: "warning" as const };
    return { label: "Lav", variant: "destructive" as const };
  };

  const getDocStatusBadge = (doc: UserDocument) => {
    if (doc.confirmed_at && doc.confirmed_fields_json && Object.keys(doc.confirmed_fields_json).length === 0) {
      return <Badge variant="destructive" className="text-[9px]"><XCircle className="h-2.5 w-2.5 mr-0.5" />Avvist</Badge>;
    }
    if (doc.confirmed_at) {
      return <Badge variant="success" className="text-[9px]"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Bekreftet</Badge>;
    }
    if (doc.ai_processed_at && doc.extracted_fields_json) {
      return <Badge variant="default" className="text-[9px]"><Sparkles className="h-2.5 w-2.5 mr-0.5" />AI-forslag klart</Badge>;
    }
    if (aiProcessing && selectedDocId === doc.id) {
      return <Badge variant="secondary" className="text-[9px]"><Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />AI analyserer</Badge>;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/ansatte")}>
          <ArrowLeft className="h-4 w-4 mr-1" />Tilbake
        </Button>
        <p className="text-sm text-muted-foreground text-center py-12">Fant ikke ansattdata.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/ansatte")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{profile.name}</h1>
            {profile.archived_at ? (
              <Badge variant="destructive" className="text-[10px]">Arkivert</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">Aktiv</Badge>
            )}
            {profile.is_plannable_resource && (
              <Badge variant="success" className="text-[10px]">Planleggbar</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{profile.email}</p>
          {profile.trade_certificate_type && (
            <p className="text-xs text-muted-foreground">{profile.trade_certificate_type}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant={profile.archived_at ? "outline" : "destructive"} size="sm" onClick={handleArchiveToggle} disabled={saving}>
            {profile.archived_at ? <><ArchiveRestore className="h-4 w-4 mr-1" />Gjenopprett</> : <><Archive className="h-4 w-4 mr-1" />Arkiver</>}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile" className="w-full">
        <TabsList>
          <TabsTrigger value="profile"><User className="h-4 w-4 mr-1.5" />Profil</TabsTrigger>
          <TabsTrigger value="documents"><FolderOpen className="h-4 w-4 mr-1.5" />Dokumenter</TabsTrigger>
          <TabsTrigger value="competence"><GraduationCap className="h-4 w-4 mr-1.5" />Kompetanse</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <div className="rounded-lg border p-4 sm:p-6 space-y-5 max-w-2xl">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Lagre profil
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Left: upload + list */}
            <div className={`space-y-4 ${aiReview ? "lg:w-1/2" : "w-full max-w-3xl"}`}>
              {/* Upload */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last opp dokument</p>
                  <Badge variant="default" className="text-[9px]"><Sparkles className="h-2.5 w-2.5 mr-0.5" />AI-analyse</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                <label className="flex items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 cursor-pointer hover:bg-accent/50 transition-colors">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-sm text-muted-foreground">{uploading ? "Laster opp..." : "Dra fil hit eller klikk for å velge"}</span>
                  <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>
              </div>

              {aiProcessing && (
                <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div>
                    <p className="text-sm font-medium">Analyserer dokument med AI...</p>
                    <p className="text-xs text-muted-foreground">Dette kan ta noen sekunder</p>
                  </div>
                </div>
              )}

              {/* Document list */}
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Ingen dokumenter lastet opp ennå.</p>
              ) : (
                <div className="space-y-4">
                  {DOC_CATEGORIES.map((cat) => {
                    const catDocs = documents.filter((d) => d.category === cat.value);
                    if (catDocs.length === 0) return null;
                    return (
                      <div key={cat.value}>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{cat.label}</p>
                        <div className="space-y-1">
                          {catDocs.map((doc) => (
                            <div
                              key={doc.id}
                              className={`flex items-center justify-between rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${selectedDocId === doc.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                              onClick={() => openDocReview(doc)}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-sm truncate">{doc.file_name}</span>
                                {doc.doc_type && doc.doc_type !== "unknown" && (
                                  <span className="text-[10px] text-muted-foreground">{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</span>
                                )}
                                {getExpiryBadge(doc.expires_at)}
                                {getDocStatusBadge(doc)}
                              </div>
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc); }}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: AI review inline panel */}
            {aiReview && (
              <div className="lg:w-1/2 rounded-lg border p-4 space-y-4 bg-card">
                <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3">
                  <Sparkles className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">AI-forslag – {DOC_TYPE_LABELS[aiReview.docType] || aiReview.docType}</p>
                    <p className="text-xs text-muted-foreground">Gjennomgå og korriger feltene.</p>
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

                <div className="space-y-3">
                  {Object.entries(aiReview.extractedFields).map(([key, value]) => {
                    const confidence = aiReview.confidence[key] ?? 0;
                    const { label: confLabel, variant } = getConfidenceLabel(confidence);
                    const isLowConfidence = confidence < 60;
                    return (
                      <div key={key} className={`rounded-lg border p-3 space-y-1.5 ${isLowConfidence ? "border-destructive/30 bg-destructive/5" : "border-border"}`}>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium">{FIELD_LABELS[key] || key}</Label>
                          <div className="flex items-center gap-1">
                            <Badge variant={variant} className="text-[10px]">{confLabel} ({confidence}%)</Badge>
                          </div>
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

                <Separator />

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={handleRejectAi}>
                    <XCircle className="h-4 w-4 mr-1" />Avvis AI-forslag
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={handleConfirmWithoutProfile} disabled={confirmingSave}>
                    Lagre uten profil
                  </Button>
                  <Button size="sm" className="flex-1" onClick={handleConfirmAiAndUpdateProfile} disabled={confirmingSave}>
                    {confirmingSave ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                    Bekreft og lagre til profil
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Competence Tab */}
        <TabsContent value="competence">
          <div className="rounded-lg border p-4 sm:p-6 max-w-2xl space-y-4">
            <h3 className="text-sm font-semibold">Kompetanseoversikt</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Fagbrev</p>
                <p className="text-sm font-medium">{profile.trade_certificate_type || "Ikke registrert"}</p>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Førerkort</p>
                <p className="text-sm font-medium">{profile.driver_license_classes || "Ikke registrert"}</p>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium">HMS-kort</p>
                <p className="text-sm font-medium">{profile.hms_card_number || "Ikke registrert"}</p>
                {profile.hms_card_expires_at && (
                  <div className="pt-1">{getExpiryBadge(profile.hms_card_expires_at)}</div>
                )}
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Kursbevis</p>
                <p className="text-sm font-medium">
                  {documents.filter(d => d.category === "course" && d.confirmed_at).length} bekreftet
                </p>
              </div>
            </div>

            {/* Expiring documents */}
            {(() => {
              const expiring = documents.filter(d => {
                if (!d.expires_at) return false;
                const days = differenceInDays(new Date(d.expires_at), new Date());
                return days <= 30;
              });
              if (expiring.length === 0) return null;
              return (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-destructive uppercase tracking-wider">Utløper snart</h4>
                  {expiring.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
                      <FileText className="h-4 w-4 text-destructive shrink-0" />
                      <span className="text-sm truncate flex-1">{doc.file_name}</span>
                      {getExpiryBadge(doc.expires_at)}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
