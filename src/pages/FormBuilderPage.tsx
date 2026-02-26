import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Save,
  ArrowLeft,
  Loader2,
  FileText,
  Trash2,
  Archive,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import type { FormField, FormFieldType, FormRule } from "@/lib/form-types";
import { FIELD_TYPE_LABELS, fieldSupportsComment } from "@/lib/form-types";
import { FormFieldPalette } from "@/components/forms/FormFieldPalette";
import { FormCanvas } from "@/components/forms/FormCanvas";

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
    setDeleting(templateId);
    await supabase
      .from("form_templates")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", templateId);
    toast.success("Mal slettet");
    if (editingTemplate === templateId) {
      setEditingTemplate(null);
      setFields([]);
      setRules([]);
    }
    fetchTemplates();
    setDeleting(null);
  };

  const handleArchiveTemplate = async (templateId: string) => {
    setDeleting(templateId);
    await supabase
      .from("form_templates")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", templateId);
    toast.success("Mal arkivert");
    if (editingTemplate === templateId) {
      setEditingTemplate(null);
      setFields([]);
      setRules([]);
    }
    fetchTemplates();
    setDeleting(null);
  };

  const addField = (type: FormFieldType) => {
    const newField: FormField = {
      id: crypto.randomUUID(),
      type,
      label: FIELD_TYPE_LABELS[type],
      order: fields.length,
      required: type !== "section_header" && !type.startsWith("smart_"),
      allow_comment: fieldSupportsComment(type),
    };
    if (type === "checkbox_list" || type === "dropdown" || type === "radio") {
      newField.options = ["Alternativ 1", "Alternativ 2"];
    }
    setFields([...fields, newField]);
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

  // ─── Template list view ───
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
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {count > 0 ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => handleArchiveTemplate(tpl.id)} disabled={deleting === tpl.id} title="Arkiver mal">
                          <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => handleDeleteTemplate(tpl.id)} disabled={deleting === tpl.id} title="Slett mal">
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

  // ─── Builder view (two-panel layout) ───
  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Top bar */}
      <div className="shrink-0 border-b border-border bg-card px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl shrink-0"
            onClick={() => {
              setEditingTemplate(null);
              setFields([]);
              setRules([]);
              fetchTemplates();
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border-none bg-transparent text-sm font-bold p-0 h-auto focus-visible:ring-0"
              placeholder="Malnavn..."
            />
            <div className="flex items-center gap-2 mt-0.5">
              {versions.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {versions.length} versjon{versions.length > 1 ? "er" : ""}
                </span>
              )}
              {activeVersionId && (
                <Badge variant="default" className="text-[9px] px-1.5 py-0">
                  Aktiv v{versions.find(v => v.id === activeVersionId)?.version_number || "?"}
                </Badge>
              )}
              {!activeVersionId && versions.length > 0 && (
                <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Ingen aktiv</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
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

          {/* Version selector */}
          {versions.length > 1 && (
            <div className="flex gap-1">
              {versions.slice(0, 5).map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVersionActive(v.id)}
                  className={`inline-flex items-center rounded-lg px-2 py-1 text-[10px] font-medium border transition-colors ${
                    v.id === activeVersionId
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-card text-muted-foreground border-border hover:border-primary/20"
                  }`}
                >
                  v{v.version_number}
                  {v.id === activeVersionId && " ✓"}
                </button>
              ))}
            </div>
          )}

          <Button size="sm" className="rounded-xl gap-1.5" onClick={() => saveVersion(true)} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Lagre & publiser
          </Button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Field palette */}
        <div className="w-64 shrink-0 border-r border-border bg-background overflow-y-auto p-3">
          <p className="text-xs font-semibold text-foreground mb-3">Felt</p>
          <FormFieldPalette onAddField={addField} />
        </div>

        {/* Right: Canvas */}
        <div className="flex-1 overflow-y-auto bg-background p-6">
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Description */}
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-xl text-xs bg-card border-border"
              rows={2}
              placeholder="Beskrivelse av skjemaet (valgfri)..."
            />

            {/* Canvas */}
            <FormCanvas
              fields={fields}
              rules={rules}
              templateTitle={title}
              onFieldsChange={setFields}
              onRulesChange={setRules}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
