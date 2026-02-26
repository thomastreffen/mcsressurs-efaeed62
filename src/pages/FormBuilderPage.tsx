import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  GripVertical,
  Trash2,
  Save,
  ArrowLeft,
  Loader2,
  FileText,
  CheckSquare,
  ListChecks,
  Type,
  AlignLeft,
  Hash,
  Calendar,
  PenTool,
  Camera,
  Heading,
  Copy,
  ChevronUp,
  ChevronDown,
  Archive,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import type { FormField, FormFieldType, FormRule } from "@/lib/form-types";
import { FIELD_TYPE_LABELS, fieldSupportsComment } from "@/lib/form-types";
import { Switch } from "@/components/ui/switch";

const FIELD_ICONS: Record<FormFieldType, React.ElementType> = {
  section_header: Heading,
  checkbox_yes_no: CheckSquare,
  checkbox_list: ListChecks,
  text: Type,
  textarea: AlignLeft,
  number: Hash,
  date: Calendar,
  signature: PenTool,
  photo_upload: Camera,
};

interface Template {
  id: string;
  title: string;
  description: string | null;
  active_version_id: string | null;
  created_at: string;
}

export default function FormBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAdmin } = useAuth();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [rules, setRules] = useState<FormRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<{ id: string; version_number: number; created_at: string }[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [instanceCounts, setInstanceCounts] = useState<Record<string, number>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from("form_templates")
      .select("id, title, description, active_version_id, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (data) {
      setTemplates(data as any);
      // Fetch instance counts for each template
      const ids = (data as any[]).map((t: any) => t.id);
      if (ids.length > 0) {
        const { data: instances } = await supabase
          .from("form_instances")
          .select("template_id")
          .in("template_id", ids);
        const counts: Record<string, number> = {};
        (instances || []).forEach((i: any) => {
          counts[i.template_id] = (counts[i.template_id] || 0) + 1;
        });
        setInstanceCounts(counts);
      }
    }
    setLoading(false);
  };

  // Auto-open template from URL param ?edit=templateId
  useEffect(() => {
    fetchTemplates();
    const editId = searchParams.get("edit");
    if (editId) {
      loadTemplate(editId);
    }
  }, []);

  const loadTemplate = async (templateId: string) => {
    setEditingTemplate(templateId);
    const { data: tpl } = await supabase
      .from("form_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (tpl) {
      setTitle((tpl as any).title);
      setDescription((tpl as any).description || "");
      setActiveVersionId((tpl as any).active_version_id);
    }

    const { data: vers } = await supabase
      .from("form_template_versions")
      .select("id, version_number, created_at")
      .eq("template_id", templateId)
      .order("version_number", { ascending: false });

    if (vers) setVersions(vers as any);

    // Load fields: prefer active version, fallback to latest version, fallback to empty
    const versionIdToLoad = (tpl as any)?.active_version_id
      || (vers && vers.length > 0 ? (vers as any[])[0].id : null);

    if (versionIdToLoad) {
      const { data: ver } = await supabase
        .from("form_template_versions")
        .select("fields, rules")
        .eq("id", versionIdToLoad)
        .single();
      if (ver) {
        setFields(((ver as any).fields || []) as FormField[]);
        setRules(((ver as any).rules || []) as FormRule[]);
      } else {
        setFields([]);
        setRules([]);
      }
    } else {
      // No versions at all — start with empty draft
      setFields([]);
      setRules([]);
    }
  };

  const createNewTemplate = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("form_templates")
      .insert({ title: "Nytt skjema", created_by: user.id })
      .select("id")
      .single();

    if (error) {
      toast.error("Kunne ikke opprette mal", { description: error.message });
      return;
    }
    if (data) {
      await fetchTemplates();
      loadTemplate((data as any).id);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    const count = instanceCounts[templateId] || 0;
    if (count > 0) {
      toast.error("Kan ikke slettes", {
        description: `Malen er brukt i ${count} prosjekt${count > 1 ? "er" : ""}. Bruk arkivering i stedet.`,
      });
      return;
    }
    const reason = prompt("Begrunnelse for sletting (valgfri):");
    setDeleting(templateId);
    const { error } = await supabase
      .from("form_templates")
      .update({
        deleted_at: new Date().toISOString(),
        // deleted_by and delete_reason would need columns - using description fallback
      })
      .eq("id", templateId);

    if (error) {
      toast.error("Kunne ikke slette", { description: error.message });
    } else {
      toast.success("Mal slettet");
      if (editingTemplate === templateId) {
        setEditingTemplate(null);
        setFields([]);
        setRules([]);
      }
      fetchTemplates();
    }
    setDeleting(null);
  };

  const handleArchiveTemplate = async (templateId: string) => {
    // Soft-archive by setting deleted_at (same pattern, templates are hidden from dropdowns)
    setDeleting(templateId);
    const { error } = await supabase
      .from("form_templates")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", templateId);
    if (error) {
      toast.error("Kunne ikke arkivere", { description: error.message });
    } else {
      toast.success("Mal arkivert");
      if (editingTemplate === templateId) {
        setEditingTemplate(null);
        setFields([]);
        setRules([]);
      }
      fetchTemplates();
    }
    setDeleting(null);
  };

  const addField = (type: FormFieldType) => {
    const newField: FormField = {
      id: crypto.randomUUID(),
      type,
      label: FIELD_TYPE_LABELS[type],
      order: fields.length,
      required: type !== "section_header",
      allow_comment: fieldSupportsComment(type),
    };
    if (type === "checkbox_list") {
      newField.options = ["Alternativ 1", "Alternativ 2"];
    }
    setFields([...fields, newField]);
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    setFields(fields.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const removeField = (id: string) => {
    setFields(fields.filter((f) => f.id !== id));
    setRules(rules.filter((r) => r.field_id !== id));
  };

  const duplicateField = (idx: number) => {
    const source = fields[idx];
    const dup: FormField = { ...source, id: crypto.randomUUID(), label: `${source.label} (kopi)`, order: fields.length };
    const newFields = [...fields];
    newFields.splice(idx + 1, 0, dup);
    setFields(newFields.map((f, i) => ({ ...f, order: i })));
  };

  const moveField = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= fields.length) return;
    const newFields = [...fields];
    const [moved] = newFields.splice(fromIdx, 1);
    newFields.splice(toIdx, 0, moved);
    setFields(newFields.map((f, i) => ({ ...f, order: i })));
  };

  const saveVersion = async (setActive = true) => {
    if (!editingTemplate || !user) return;
    setSaving(true);

    await supabase
      .from("form_templates")
      .update({ title, description: description || null })
      .eq("id", editingTemplate);

    const nextVersion = versions.length > 0 ? versions[0].version_number + 1 : 1;

    const { data: ver, error } = await supabase
      .from("form_template_versions")
      .insert({
        template_id: editingTemplate,
        version_number: nextVersion,
        fields: fields as any,
        rules: rules as any,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      toast.error("Kunne ikke lagre versjon", { description: error.message });
      setSaving(false);
      return;
    }

    if (ver && setActive) {
      await supabase
        .from("form_templates")
        .update({ active_version_id: (ver as any).id })
        .eq("id", editingTemplate);
    }

    toast.success(`Versjon ${nextVersion} lagret${setActive ? " og satt som aktiv" : ""}`);
    await loadTemplate(editingTemplate);
    setSaving(false);
  };

  const setVersionActive = async (versionId: string) => {
    if (!editingTemplate) return;
    await supabase
      .from("form_templates")
      .update({ active_version_id: versionId })
      .eq("id", editingTemplate);
    toast.success("Aktiv versjon oppdatert");
    loadTemplate(editingTemplate);
  };

  // Template list view
  if (!editingTemplate) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-bold">Skjemamaler</h1>
              <p className="text-xs text-muted-foreground">Bygg og administrer skjemamaler</p>
            </div>
          </div>
          <Button size="sm" className="rounded-xl gap-1.5" onClick={createNewTemplate}>
            <Plus className="h-3.5 w-3.5" />
            Ny mal
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Ingen maler ennå</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Opprett din første skjemamal</p>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((tpl) => {
              const count = instanceCounts[tpl.id] || 0;
              return (
                <div
                  key={tpl.id}
                  className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors cursor-pointer flex items-center justify-between group"
                  onClick={() => loadTemplate(tpl.id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{tpl.title}</p>
                    {tpl.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{tpl.description}</p>
                    )}
                    {count > 0 && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">Brukt i {count} prosjekt{count > 1 ? "er" : ""}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={tpl.active_version_id ? "default" : "secondary"} className="text-[10px]">
                      {tpl.active_version_id ? "Aktiv" : "Ingen versjon"}
                    </Badge>
                    {/* Delete / Archive buttons */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {count > 0 ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg"
                          onClick={() => handleArchiveTemplate(tpl.id)}
                          disabled={deleting === tpl.id}
                          title="Arkiver mal"
                        >
                          <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg"
                          onClick={() => handleDeleteTemplate(tpl.id)}
                          disabled={deleting === tpl.id}
                          title="Slett mal"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Builder view
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => {
              setEditingTemplate(null);
              setFields([]);
              setRules([]);
              fetchTemplates();
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">Skjemabygger</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground">
                {versions.length > 0
                  ? `${versions.length} versjon${versions.length > 1 ? "er" : ""}`
                  : "Ingen versjoner"}
              </p>
              {activeVersionId && versions.length > 0 && (
                <Badge variant="default" className="text-[9px] px-1.5 py-0">
                  Aktiv v{versions.find(v => v.id === activeVersionId)?.version_number || "?"}
                </Badge>
              )}
              {!activeVersionId && versions.length > 0 && (
                <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                  Ingen aktiv
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Delete/archive in builder */}
          {editingTemplate && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl text-xs text-muted-foreground"
              onClick={() => {
                const count = instanceCounts[editingTemplate] || 0;
                if (count > 0) handleArchiveTemplate(editingTemplate);
                else handleDeleteTemplate(editingTemplate);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              {(instanceCounts[editingTemplate] || 0) > 0 ? "Arkiver" : "Slett"}
            </Button>
          )}
          <Button size="sm" className="rounded-xl gap-1.5" onClick={() => saveVersion(true)} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Lagre versjon
          </Button>
        </div>
      </div>

      {/* Template meta */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 mb-6">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Malnavn</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl h-9" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Beskrivelse</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-xl min-h-[60px]"
            rows={2}
          />
        </div>
      </div>

      {/* Version list (if multiple) */}
      {versions.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-3 mb-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Versjoner</p>
          <div className="flex flex-wrap gap-1.5">
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setVersionActive(v.id)}
                className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors ${
                  v.id === activeVersionId
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-card text-muted-foreground border-border hover:border-primary/20"
                }`}
              >
                v{v.version_number}
                {v.id === activeVersionId && <span className="ml-1 text-[9px]">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Field palette */}
      <div className="mb-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">Legg til felt</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(FIELD_TYPE_LABELS) as FormFieldType[]).map((type) => {
            const Icon = FIELD_ICONS[type];
            return (
              <Button
                key={type}
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5 text-xs h-8"
                onClick={() => addField(type)}
              >
                <Icon className="h-3.5 w-3.5" />
                {FIELD_TYPE_LABELS[type]}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Fields list */}
      <div className="space-y-2">
        {fields.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Klikk på felt-typene over for å bygge skjemaet
            </p>
          </div>
        ) : (
          fields.map((field, idx) => {
            const Icon = FIELD_ICONS[field.type];
            return (
              <div
                key={field.id}
                className="rounded-xl border border-border bg-card p-3 flex items-start gap-3 group"
              >
                {/* Move buttons */}
                <div className="flex flex-col gap-0.5 pt-1 shrink-0">
                  <button
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                    disabled={idx === 0}
                    onClick={() => moveField(idx, idx - 1)}
                    title="Flytt opp"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                    disabled={idx === fields.length - 1}
                    onClick={() => moveField(idx, idx + 1)}
                    title="Flytt ned"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Field config */}
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      {FIELD_TYPE_LABELS[field.type]}
                    </span>
                  </div>
                  <Input
                    value={field.label}
                    onChange={(e) => updateField(field.id, { label: e.target.value })}
                    className="rounded-lg h-8 text-sm font-medium"
                    placeholder="Feltnavn..."
                  />

                  {/* Checkbox list items */}
                  {field.type === "checkbox_list" && (
                    <div className="space-y-3 pl-1">
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground font-medium">Sjekkpunkter</p>
                        {(field.options || []).map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-1.5 group/item">
                            <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                            <Input
                              value={opt}
                              onChange={(e) => {
                                const newOpts = [...(field.options || [])];
                                newOpts[optIdx] = e.target.value;
                                updateField(field.id, { options: newOpts });
                              }}
                              className="rounded-lg h-7 text-xs flex-1"
                              placeholder="Sjekkpunkt..."
                            />
                            <button
                              className="text-muted-foreground hover:text-destructive opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5"
                              onClick={() => {
                                const newOpts = (field.options || []).filter((_, i) => i !== optIdx);
                                updateField(field.id, { options: newOpts });
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-lg gap-1 text-[10px] h-6 px-2 text-muted-foreground"
                          onClick={() => {
                            const newOpts = [...(field.options || []), `Punkt ${(field.options || []).length + 1}`];
                            updateField(field.id, { options: newOpts });
                          }}
                        >
                          <Plus className="h-3 w-3" />
                          Legg til punkt
                        </Button>
                      </div>

                      <div className="space-y-2 border-t border-border pt-2">
                        <p className="text-[10px] text-muted-foreground font-medium">Innstillinger</p>
                        <label className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">Tillat kommentar per punkt</span>
                          <Switch
                            checked={field.allow_comment !== false}
                            onCheckedChange={(v) => updateField(field.id, { allow_comment: v })}
                          />
                        </label>
                        <label className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">Krev bilde ved Avvik</span>
                          <Switch
                            checked={!!field.require_photo_on_deviation}
                            onCheckedChange={(v) => updateField(field.id, { require_photo_on_deviation: v })}
                          />
                        </label>
                        <label className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">Aktiver risiko-gradering</span>
                          <Switch
                            checked={!!field.enable_risk_grading}
                            onCheckedChange={(v) => updateField(field.id, { enable_risk_grading: v })}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Checkbox yes/no settings */}
                  {field.type === "checkbox_yes_no" && (
                    <div className="space-y-2 pl-1 border-t border-border pt-2">
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Tillat kommentar</span>
                        <Switch
                          checked={field.allow_comment !== false}
                          onCheckedChange={(v) => updateField(field.id, { allow_comment: v })}
                        />
                      </label>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={rules.some(
                            (r) => r.field_id === field.id && r.action === "require_comment"
                          )}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setRules([
                                ...rules,
                                {
                                  id: crypto.randomUUID(),
                                  field_id: field.id,
                                  condition: "equals",
                                  value: "no",
                                  action: "require_comment",
                                },
                              ]);
                            } else {
                              setRules(
                                rules.filter(
                                  (r) =>
                                    !(r.field_id === field.id && r.action === "require_comment")
                                )
                              );
                            }
                          }}
                          className="rounded"
                        />
                        <span>Krev kommentar ved "Nei"</span>
                      </div>
                    </div>
                  )}

                  {/* Generic allow_comment for other types */}
                  {fieldSupportsComment(field.type) && field.type !== "checkbox_yes_no" && field.type !== "checkbox_list" && (
                    <div className="pl-1 border-t border-border pt-2">
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {field.type === "photo_upload" ? "Tillat bildetekst" : "Tillat intern kommentar"}
                        </span>
                        <Switch
                          checked={field.allow_comment !== false}
                          onCheckedChange={(v) => updateField(field.id, { allow_comment: v })}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Field actions */}
                <div className="flex flex-col gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="text-muted-foreground hover:text-foreground p-1"
                    onClick={() => duplicateField(idx)}
                    title="Dupliser"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-destructive p-1"
                    onClick={() => removeField(field.id)}
                    title="Slett felt"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
