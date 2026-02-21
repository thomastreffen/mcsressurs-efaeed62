import { useEffect, useState, useMemo } from "react";
import { BookOpen, BarChart3, CheckCircle2, Clock, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, differenceInHours } from "date-fns";
import { nb } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface QueryRow {
  id: string;
  created_at: string;
  topic: string;
  reviewed_status: string;
  reviewed_at: string | null;
  usage_count: number;
  question: string;
}

export default function FagInsightsPage() {
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("regulation_queries")
        .select("id, created_at, topic, reviewed_status, reviewed_at, usage_count, question")
        .order("created_at", { ascending: false })
        .limit(500);
      setQueries((data || []) as QueryRow[]);
      setLoading(false);
    })();
  }, []);

  const weeklyData = useMemo(() => {
    const weeks = new Map<string, number>();
    for (const q of queries) {
      const week = format(startOfWeek(new Date(q.created_at), { weekStartsOn: 1 }), "d. MMM", { locale: nb });
      weeks.set(week, (weeks.get(week) || 0) + 1);
    }
    return Array.from(weeks.entries()).reverse().slice(-12).map(([week, count]) => ({ week, count }));
  }, [queries]);

  const approvalRate = useMemo(() => {
    const reviewed = queries.filter(q => q.reviewed_status === "approved" || q.reviewed_status === "rejected");
    if (reviewed.length === 0) return 0;
    return Math.round((reviewed.filter(q => q.reviewed_status === "approved").length / reviewed.length) * 100);
  }, [queries]);

  const medianTimeToApproval = useMemo(() => {
    const times = queries
      .filter(q => q.reviewed_at && (q.reviewed_status === "approved" || q.reviewed_status === "rejected"))
      .map(q => differenceInHours(new Date(q.reviewed_at!), new Date(q.created_at)))
      .sort((a, b) => a - b);
    if (times.length === 0) return null;
    return times[Math.floor(times.length / 2)];
  }, [queries]);

  const topTopics = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const q of queries) counts[q.topic] = (counts[q.topic] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [queries]);

  const topTemplates = useMemo(() => {
    return queries
      .filter(q => q.reviewed_status === "approved" && q.usage_count > 0)
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, 10);
  }, [queries]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">Laster…</div>;
  }

  return (
    <div className="w-full p-5 sm:p-8 space-y-8">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          Fag – Innsikt
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Statistikk og trender for fagforespørsler
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Totalt forespørsler
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{queries.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Godkjenningsrate
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{approvalRate}%</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Median tid til vurdering
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {medianTimeToApproval !== null ? `${medianTimeToApproval}t` : "–"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Gjenbruk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {queries.filter(q => q.usage_count > 0).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Forespørsler per uke</CardTitle>
        </CardHeader>
        <CardContent>
          {weeklyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weeklyData}>
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="count" name="Forespørsler" fill="hsl(213, 60%, 42%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Ingen data ennå</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top topics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Populære emner</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topTopics.map(([topic, count]) => (
                <div key={topic} className="flex items-center justify-between">
                  <Badge variant="outline">{topic}</Badge>
                  <span className="text-sm font-medium">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top templates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Mest gjenbrukte maler</CardTitle>
          </CardHeader>
          <CardContent>
            {topTemplates.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Ingen gjenbrukte maler ennå</p>
            ) : (
              <div className="space-y-2">
                {topTemplates.map(q => (
                  <div key={q.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{q.question}</p>
                      <Badge variant="outline" className="text-[9px] mt-0.5">{q.topic}</Badge>
                    </div>
                    <span className="text-sm font-medium shrink-0">{q.usage_count}×</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
