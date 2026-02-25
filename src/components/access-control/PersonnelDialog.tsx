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
import { Loader2, Upload, FileText, AlertTriangle, Trash2, Archive, ArchiveRestore } from "lucide-react";
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
  file_name: string;
  file_path: string;
  expires_at: string | null;
  created_at: string;
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
        .select("id, category, file_name, file_path, expires_at, created_at")
        .eq("user_id", technicianId)
        .order("created_at", { ascending: false }),
    ]);
    if (techRes.data) setProfile(techRes.data as any);
    setDocuments((docsRes.data as any[]) || []);
    setLoading(false);
  }, [technicianId]);

  useEffect(() => {
    if (open && technicianId) fetchData();
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
    const { error: insertError } = await supabase
      .from("user_documents")
      .insert({
        user_id: profile.id,
        category: uploadCategory,
        file_name: file.name,
        file_path: path,
        expires_at: uploadExpiry || null,
        uploaded_by: user?.id || null,
      });
    setUploading(false);
    if (insertError) {
      toast.error("Feil ved registrering", { description: insertError.message });
    } else {
      toast.success("Dokument lastet opp");
      setUploadExpiry("");
      fetchData();
    }
    e.target.value = "";
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

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{profile?.name || "Bruker"} – Personalmappe</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
                  {/* Plannable resource */}
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
                      <Input
                        type="date"
                        value={profile.birth_date || ""}
                        onChange={(e) => setProfile({ ...profile, birth_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">HMS-kortnummer</Label>
                      <Input
                        value={profile.hms_card_number || ""}
                        onChange={(e) => setProfile({ ...profile, hms_card_number: e.target.value })}
                        placeholder="Kortnr."
                      />
                    </div>
                    <div>
                      <Label className="text-xs">HMS-kort utløper</Label>
                      <Input
                        type="date"
                        value={profile.hms_card_expires_at || ""}
                        onChange={(e) => setProfile({ ...profile, hms_card_expires_at: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Fagbrev-type</Label>
                      <Input
                        value={profile.trade_certificate_type || ""}
                        onChange={(e) => setProfile({ ...profile, trade_certificate_type: e.target.value })}
                        placeholder="F.eks. Elektriker"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Førerkortklasser</Label>
                    <Input
                      value={profile.driver_license_classes || ""}
                      onChange={(e) => setProfile({ ...profile, driver_license_classes: e.target.value })}
                      placeholder="F.eks. B, BE, C1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Notater</Label>
                    <Textarea
                      value={profile.notes || ""}
                      onChange={(e) => setProfile({ ...profile, notes: e.target.value })}
                      rows={3}
                      placeholder="Interne notater om ansatt..."
                    />
                  </div>

                  {profile.hms_card_expires_at && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">HMS-kort:</span>
                      {getExpiryBadge(profile.hms_card_expires_at)}
                    </div>
                  )}

                  <Separator />

                  {/* Archive toggle */}
                  <div className="flex items-center justify-between rounded-lg border border-destructive/20 p-3">
                    <div>
                      <p className="text-sm font-medium">{profile.archived_at ? "Bruker er arkivert" : "Arkiver bruker"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {profile.archived_at ? "Skjult fra ressursplan og aktive lister" : "Skjuler brukeren fra alle aktive lister"}
                      </p>
                    </div>
                    <Button
                      variant={profile.archived_at ? "outline" : "destructive"}
                      size="sm"
                      onClick={handleArchiveToggle}
                      disabled={saving}
                    >
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
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last opp dokument</p>
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
                      <span className="text-sm text-muted-foreground">{uploading ? "Laster opp..." : "Velg fil"}</span>
                      <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                    </label>
                  </div>

                  <Separator />

                  {/* Document list grouped by category */}
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
