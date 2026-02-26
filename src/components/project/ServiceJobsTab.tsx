import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Hammer, MapPin, Clock, User, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface ServiceJob {
  id: string;
  title: string;
  description: string | null;
  address: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  case_id: string | null;
  technician_id: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  planned: "Planlagt",
  in_progress: "Pågår",
  done: "Ferdig",
  cancelled: "Kansellert",
};

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-blue-500/10 text-blue-600",
  in_progress: "bg-amber-500/10 text-amber-600",
  done: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-muted text-muted-foreground",
};

interface ServiceJobsTabProps {
  projectId: string;
}

export function ServiceJobsTab({ projectId }: ServiceJobsTabProps) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [techMap, setTechMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("service_jobs")
      .select("*")
      .eq("project_id", projectId)
      .order("starts_at", { ascending: true });
    setJobs((data as unknown as ServiceJob[]) || []);
    setLoading(false);
  }, [projectId]);

  const fetchTechs = useCallback(async () => {
    const { data } = await supabase.from("technicians").select("id, name");
    const map = new Map<string, string>();
    for (const t of data || []) map.set(t.id, t.name);
    setTechMap(map);
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchTechs();
  }, [fetchJobs, fetchTechs]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Hammer className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">Ingen servicearbeid</p>
        <p className="text-xs mt-1">Servicearbeid opprettes fra Henvendelser</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Hammer className="h-4 w-4 text-primary" />
          Servicearbeid ({jobs.length})
        </h3>
      </div>
      {jobs.map((sj) => (
        <Card key={sj.id} className="p-4 hover:bg-muted/30 transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate">{sj.title}</p>
                <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[sj.status] || ""}`}>
                  {STATUS_LABELS[sj.status] || sj.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(sj.starts_at), "d. MMM HH:mm", { locale: nb })} – {format(new Date(sj.ends_at), "HH:mm", { locale: nb })}
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {techMap.get(sj.technician_id) || "Ukjent"}
                </span>
                {sj.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {sj.address}
                  </span>
                )}
              </div>
              {sj.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{sj.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {sj.case_id && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate("/inbox")}>
                  <ExternalLink className="h-3 w-3" />
                  Henvendelse
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
