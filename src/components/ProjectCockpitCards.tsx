import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarCheck, ListChecks, AlertTriangle, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface Props {
  jobId: string;
}

interface NextActivity {
  title: string;
  scheduled_date: string | null;
  start_time: string | null;
  techNames: string[];
}

export function ProjectCockpitCards({ jobId }: Props) {
  const navigate = useNavigate();
  const [nextActivity, setNextActivity] = useState<NextActivity | null>(null);
  const [openTasks, setOpenTasks] = useState(0);
  const [totalTasks, setTotalTasks] = useState(0);
  const [riskCount, setRiskCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch tasks
      const { data: tasks } = await supabase
        .from("job_tasks")
        .select("id, title, status, scheduled_date, start_time, assigned_technician_ids")
        .eq("job_id", jobId)
        .order("scheduled_date", { ascending: true });

      if (tasks) {
        setTotalTasks(tasks.length);
        const pending = tasks.filter((t: any) => t.status !== "completed");
        setOpenTasks(pending.length);

        // Find next scheduled task
        const today = new Date().toISOString().split("T")[0];
        const upcoming = pending.find((t: any) => t.scheduled_date && t.scheduled_date >= today);
        if (upcoming) {
          // Get tech names
          const techIds = (upcoming as any).assigned_technician_ids || [];
          let techNames: string[] = [];
          if (techIds.length > 0) {
            const { data: techs } = await supabase
              .from("technicians")
              .select("name")
              .in("id", techIds);
            if (techs) techNames = techs.map((t: any) => t.name);
          }
          setNextActivity({
            title: (upcoming as any).title,
            scheduled_date: (upcoming as any).scheduled_date,
            start_time: (upcoming as any).start_time,
            techNames,
          });
        }
      }

      // Fetch risks
      const { count } = await supabase
        .from("job_risk_items")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .eq("status", "open");
      setRiskCount(count || 0);

      setLoading(false);
    };
    fetchData();
  }, [jobId]);

  if (loading) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Next Activity */}
      <Card className="rounded-2xl border-border/50">
        <CardContent className="py-4 px-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <CalendarCheck className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Neste aktivitet</p>
              {nextActivity ? (
                <>
                  <p className="text-sm font-semibold truncate mt-0.5">{nextActivity.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {nextActivity.scheduled_date && format(new Date(nextActivity.scheduled_date), "EEE d. MMM", { locale: nb })}
                    {nextActivity.start_time && ` kl. ${nextActivity.start_time.slice(0, 5)}`}
                  </p>
                  {nextActivity.techNames.length > 0 && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                      {nextActivity.techNames.join(", ")}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground/60 mt-0.5">Ingen planlagte aktiviteter</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Open Tasks */}
      <Card className="rounded-2xl border-border/50 cursor-pointer hover:bg-secondary/30 transition-colors"
            onClick={() => navigate(`/projects/${jobId}?tab=plan`)}>
        <CardContent className="py-4 px-4">
          <div className="flex items-start gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${openTasks > 0 ? "bg-accent/10" : "bg-success/10"}`}>
              <ListChecks className={`h-4 w-4 ${openTasks > 0 ? "text-accent" : "text-success"}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Åpne oppgaver</p>
              <p className="text-2xl font-bold mt-0.5 leading-tight">{openTasks}</p>
              <p className="text-xs text-muted-foreground/60">
                {totalTasks > 0 ? `av ${totalTasks} totalt` : "Ingen oppgaver ennå"}
              </p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 mt-2" />
          </div>
        </CardContent>
      </Card>

      {/* Risks */}
      <Card className="rounded-2xl border-border/50 cursor-pointer hover:bg-secondary/30 transition-colors"
            onClick={() => navigate(`/projects/${jobId}?tab=risiko`)}>
        <CardContent className="py-4 px-4">
          <div className="flex items-start gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${riskCount > 0 ? "bg-destructive/10" : "bg-success/10"}`}>
              <AlertTriangle className={`h-4 w-4 ${riskCount > 0 ? "text-destructive" : "text-success"}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Åpne risikoer</p>
              <p className="text-2xl font-bold mt-0.5 leading-tight">{riskCount}</p>
              <p className="text-xs text-muted-foreground/60">
                {riskCount > 0 ? "Krever oppfølging" : "Ingen aktive"}
              </p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 mt-2" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
