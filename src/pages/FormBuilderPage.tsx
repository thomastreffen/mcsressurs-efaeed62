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
  Upload,
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
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import type { FormField, FormFieldType, FormRule } from "@/lib/form-types";
import { FIELD_TYPE_LABELS } from "@/lib/form-types";
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
  const { user } = useAuth();

  // Template list state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // Builder state
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [rules, setRules] = useState<FormRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<{ id: string; version_number: number; created_at: string }[]>([]);

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from("form_templates")
      .select("id, title, description, active_version_id, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (data) setTemplates(data as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
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
    }

    // Load versions
    const { data: vers } = await supabase
      .from("form_template_versions")
      .select("id, version_number, created_at")
      .eq("template_id", templateId)
      .order("version_number", { ascending: false });

    if (vers) setVersions(vers as any);

    // Load active version fields
    if ((tpl as any)?.active_version_id) {
      const { data: ver } = await supabase
        .from("form_template_versions")
        .select("fields, rules")
        .eq("id", (tpl as any).active_version_id)
        .single();
      if (ver) {
        setFields(((ver as any).fields || []) as FormField[]);
        setRules(((ver as any).rules || []) as FormRule[]);
      }
    } else {
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

  const addField = (type: FormFieldType) => {
    const newField: FormField = {
      id: crypto.randomUUID(),
      type,
      label: FIELD_TYPE_LABELS[type],
      order: fields.length,
      required: type !== "section_header",
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

  const moveField = (fromIdx: number, toIdx: number) => {
    const newFields = [...fields];
    const [moved] = newFields.splice(fromIdx, 1);
    newFields.splice(toIdx, 0, moved);
    setFields(newFields.map((f, i) => ({ ...f, order: i })));
  };

  const saveVersion = async () => {
    if (!editingTemplate || !user) return;
    setSaving(true);

    // Update template title/description
    await supabase
      .from("form_templates")
      .update({ title, description: description || null })
      .eq("id", editingTemplate);

    // Get next version number
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

    // Set as active version
    if (ver) {
      await supabase
        .from("form_templates")
        .update({ active_version_id: (ver as any).id })
        .eq("id", editingTemplate);
    }

    toast.success(`Versjon ${nextVersion} lagret`);
    await loadTemplate(editingTemplate);
    setSaving(false);
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
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors cursor-pointer flex items-center justify-between"
                onClick={() => loadTemplate(tpl.id)}
              >
                <div>
                  <p className="font-medium text-sm">{tpl.title}</p>
                  {tpl.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                  )}
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  {tpl.active_version_id ? "Aktiv" : "Ingen versjon"}
                </Badge>
              </div>
            ))}
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
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">Skjemabygger</h1>
            <p className="text-xs text-muted-foreground">
              {versions.length > 0
                ? `${versions.length} versjon${versions.length > 1 ? "er" : ""}`
                : "Ingen versjoner"}
            </p>
          </div>
        </div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={saveVersion} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Lagre versjon
        </Button>
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
                {/* Drag handle */}
                <div className="flex flex-col gap-1 pt-1">
                  <button
                    className="text-muted-foreground hover:text-foreground cursor-grab"
                    disabled={idx === 0}
                    onClick={() => idx > 0 && moveField(idx, idx - 1)}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                </div>

                {/* Field config */}
                <div className="flex-1 space-y-2">
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
                  {field.type === "checkbox_list" && (
                    <div className="space-y-3 pl-1">
                      {/* Checklist items */}
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

                      {/* Checklist options */}
                      <div className="space-y-2 border-t border-border pt-2">
                        <p className="text-[10px] text-muted-foreground font-medium">Innstillinger</p>
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
                  {field.type === "checkbox_yes_no" && (
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
                  )}
                </div>

                {/* Remove */}
                <button
                  className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-1"
                  onClick={() => removeField(field.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
