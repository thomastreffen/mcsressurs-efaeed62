import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  FileText,
  Upload,
  Search,
  ClipboardList,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { FORM_STATUS_CONFIG, type FormInstanceStatus } from "@/lib/form-types";
import { toast } from "sonner";

interface ProjectFormsTabProps {
  projectId: string;
  isAdmin: boolean;
}

interface FormInstanceRow {
  id: string;
  status: string;
  updated_at: string;
  assigned_to: string | null;
  template: { id: string; title: string } | null;
}

export function ProjectFormsTab({ projectId, isAdmin }: ProjectFormsTabProps) {
  const navigate = useNavigate();
  const [instances, setInstances] = useState<FormInstanceRow[]>([]);
  const [templates, setTemplates] = useState<{ id: string; title: string; active_version_id: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchInstances = async () => {
    const { data } = await supabase
      .from("form_instances")
      .select("id, status, updated_at, assigned_to, template_id")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false });

    if (data) {
      const templateIds = [...new Set(data.map((d: any) => d.template_id))];
      const { data: tpls } = await supabase
        .from("form_templates")
        .select("id, title")
        .in("id", templateIds);

      const tplMap = new Map((tpls || []).map((t: any) => [t.id, t]));
      setInstances(
        data.map((d: any) => ({
          ...d,
          template: tplMap.get(d.template_id) || null,
        }))
      );
    }
    setLoading(false);
  };

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from("form_templates")
      .select("id, title, active_version_id")
      .is("deleted_at", null)
      .order("title");
    if (data) setTemplates(data as any);
  };

  useEffect(() => {
    fetchInstances();
    fetchTemplates();
  }, [projectId]);

  const handleCreateFromTemplate = async (templateId?: string) => {
    const tpl = templateId ? templates.find((t) => t.id === templateId) : null;

    if (tpl && !tpl.active_version_id) {
      toast.error("Malen har ingen aktiv versjon", {
        description: isAdmin ? "Åpne malen i skjemabyggeren for å publisere en versjon." : undefined,
      });
      return;
    }

    setCreating(true);
    const { data: userData } = await supabase.auth.getUser();

    if (!tpl) {
      // Create blank ad-hoc template
      const { data: blankTpl, error: tplErr } = await supabase
        .from("form_templates")
        .insert({ title: "Blankt skjema", created_by: userData.user!.id })
        .select("id")
        .single();

      if (tplErr || !blankTpl) {
        toast.error("Kunne ikke opprette skjema");
        setCreating(false);
        return;
      }

      // Create version with empty fields
      const { data: ver, error: verErr } = await supabase
        .from("form_template_versions")
        .insert({
          template_id: (blankTpl as any).id,
          version_number: 1,
          fields: [] as any,
          rules: [] as any,
          created_by: userData.user!.id,
        })
        .select("id")
        .single();

      if (verErr || !ver) {
        toast.error("Kunne ikke opprette versjon");
        setCreating(false);
        return;
      }

      await supabase
        .from("form_templates")
        .update({ active_version_id: (ver as any).id })
        .eq("id", (blankTpl as any).id);

      const { data: inst, error: instErr } = await supabase
        .from("form_instances")
        .insert({
          template_id: (blankTpl as any).id,
          version_id: (ver as any).id,
          project_id: projectId,
          created_by: userData.user!.id,
          status: "not_started",
        })
        .select("id")
        .single();

      if (instErr) {
        toast.error("Kunne ikke opprette skjema", { description: instErr.message });
      } else if (inst) {
        toast.success("Blankt skjema opprettet");
        navigate(`/forms/${(inst as any).id}`);
      }
      setCreating(false);
      return;
    }

    // Create from selected template
    const { data, error } = await supabase
      .from("form_instances")
      .insert({
        template_id: tpl.id,
        version_id: tpl.active_version_id!,
        project_id: projectId,
        created_by: userData.user!.id,
        status: "not_started",
      })
      .select("id")
      .single();

    if (error) {
      toast.error("Kunne ikke opprette skjema", { description: error.message });
    } else if (data) {
      toast.success("Skjema opprettet");
      navigate(`/forms/${(data as any).id}`);
    }
    setCreating(false);
  };

  const handleCreate = () => handleCreateFromTemplate(selectedTemplate || undefined);

  const filtered = instances.filter((i) =>
    !search || i.template?.title?.toLowerCase().includes(search.toLowerCase())
  );

  const activeTemplates = templates.filter((t) => t.active_version_id);
  const inactiveTemplates = templates.filter((t) => !t.active_version_id);

  return (
    <div className="space-y-4">
      {/* Header + CTAs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk skjemaer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-xl"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl gap-1.5 text-xs"
            onClick={() => handleCreateFromTemplate()}
            disabled={creating}
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Nytt skjema
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl gap-1.5 text-xs"
            onClick={() => setShowNewForm(!showNewForm)}
          >
            <FileText className="h-3.5 w-3.5" />
            Fra mal
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl gap-1.5 text-xs"
              onClick={() => navigate(`/admin/forms?import=true&project=${projectId}`)}
            >
              <Upload className="h-3.5 w-3.5" />
              Importer PDF med AI
            </Button>
          )}
        </div>
      </div>

      {/* Template selector */}
      {showNewForm && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Velg mal</label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="rounded-xl h-9">
                <SelectValue placeholder="Velg skjemamal..." />
              </SelectTrigger>
              <SelectContent>
                {activeTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
                {inactiveTemplates.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[10px] text-muted-foreground font-medium">Uten aktiv versjon</div>
                    {inactiveTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id} disabled>
                        {t.title} (ingen aktiv versjon)
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              {selectedTemplate && !templates.find(t => t.id === selectedTemplate)?.active_version_id && isAdmin && (
                <Button
                  variant="link"
                  size="sm"
                  className="text-xs p-0 h-auto gap-1"
                  onClick={() => navigate("/admin/forms")}
                >
                  <ExternalLink className="h-3 w-3" />
                  Åpne mal i skjemabygger
                </Button>
              )}
            </div>
            <Button
              size="sm"
              className="rounded-xl"
              disabled={!selectedTemplate || creating || !templates.find(t => t.id === selectedTemplate)?.active_version_id}
              onClick={handleCreate}
            >
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Opprett
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Ingen skjemaer ennå</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Klikk "Nytt skjema" eller "Fra mal" for å komme i gang
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Skjema</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs hidden sm:table-cell">Sist oppdatert</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Handling</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inst) => {
                const statusCfg = FORM_STATUS_CONFIG[inst.status as FormInstanceStatus] || FORM_STATUS_CONFIG.not_started;
                return (
                  <tr
                    key={inst.id}
                    className="border-b border-border/40 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => navigate(`/forms/${inst.id}`)}
                  >
                    <td className="px-4 py-3 font-medium">
                      {inst.template?.title || "Ukjent mal"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">
                      {format(new Date(inst.updated_at), "d. MMM yyyy HH:mm", { locale: nb })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" className="rounded-xl h-7 text-xs">
                        Åpne
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
