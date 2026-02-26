import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FolderKanban, Plus, ArrowUpRight, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { JOB_STATUS_CONFIG, type JobStatus } from "@/lib/job-status";

interface SubProject {
  id: string;
  title: string;
  status: JobStatus;
  start_time: string;
  internal_number: string | null;
}

interface ParentProject {
  id: string;
  title: string;
  internal_number: string | null;
}

interface SubProjectSectionProps {
  jobId: string;
  parentProjectId: string | null;
  customerId: string | null;
}

export function SubProjectSection({ jobId, parentProjectId, customerId }: SubProjectSectionProps) {
  const navigate = useNavigate();
  const [subProjects, setSubProjects] = useState<SubProject[]>([]);
  const [parentProject, setParentProject] = useState<ParentProject | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // If this is a sub-project, fetch parent info
    if (parentProjectId) {
      const { data } = await supabase
        .from("events")
        .select("id, title, internal_number")
        .eq("id", parentProjectId)
        .single();
      if (data) setParentProject(data as any);
    }

    // If this is a parent (no parent_project_id), fetch sub-projects
    if (!parentProjectId) {
      const { data } = await supabase
        .from("events")
        .select("id, title, status, start_time, internal_number")
        .eq("parent_project_id", jobId)
        .is("deleted_at", null)
        .order("start_time", { ascending: false });
      if (data) setSubProjects(data as any);
    }

    setLoading(false);
  }, [jobId, parentProjectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return null;

  // Sub-project banner
  if (parentProjectId && parentProject) {
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <FolderKanban className="h-4 w-4 text-accent shrink-0" />
          <span className="text-muted-foreground">Underprosjekt av</span>
          <button
            onClick={() => navigate(`/projects/${parentProject.id}`)}
            className="font-medium text-foreground hover:text-primary transition-colors truncate underline-offset-2 hover:underline"
          >
            {parentProject.internal_number ? `${parentProject.internal_number} – ` : ""}
            {parentProject.title}
          </button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-7 w-7 rounded-lg"
          onClick={() => navigate(`/projects/${parentProject.id}`)}
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  // Parent project: show sub-projects list
  if (!parentProjectId) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
            Underprosjekter ({subProjects.length})
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5 h-7 text-xs"
            onClick={() => navigate(`/projects/new?customer=${customerId || ""}&parent=${jobId}`)}
          >
            <Plus className="h-3 w-3" /> Nytt underprosjekt
          </Button>
        </div>

        {subProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-6 text-center">
            <p className="text-sm text-muted-foreground">Ingen underprosjekter ennå.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {subProjects.map((sp) => (
              <Card
                key={sp.id}
                className="rounded-2xl cursor-pointer hover:bg-secondary/30 transition-colors"
                onClick={() => navigate(`/projects/${sp.id}`)}
              >
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{sp.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {sp.internal_number && <span className="font-mono mr-2">{sp.internal_number}</span>}
                      {format(new Date(sp.start_time), "d. MMM yyyy", { locale: nb })}
                    </p>
                  </div>
                  <Badge
                    className="text-[10px] whitespace-nowrap rounded-lg shrink-0"
                    style={{
                      backgroundColor: `hsl(var(--status-${sp.status.replace(/_/g, "-")}))`,
                      color: `hsl(var(--status-${sp.status.replace(/_/g, "-")}-foreground))`,
                    }}
                  >
                    {JOB_STATUS_CONFIG[sp.status]?.label || sp.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
