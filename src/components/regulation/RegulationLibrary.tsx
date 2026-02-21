import { useState, useMemo } from "react";
import { BookOpen, FileText, Plus, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RegulationQuery } from "@/hooks/useRegulationQueries";

interface Props {
  queries: RegulationQuery[];
}

export function RegulationLibrary({ queries }: Props) {
  const approved = useMemo(() =>
    queries.filter(q => q.reviewed_status === "approved").sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0)),
    [queries]
  );

  const reservations = useMemo(() => {
    const all: { text: string; topic: string; count: number }[] = [];
    for (const q of approved) {
      const res = Array.isArray(q.suggested_reservations) ? q.suggested_reservations : [];
      for (const r of res) {
        const existing = all.find(a => a.text === r);
        if (existing) existing.count++;
        else all.push({ text: r, topic: q.topic, count: 1 });
      }
    }
    return all.sort((a, b) => b.count - a.count);
  }, [approved]);

  const calcLines = useMemo(() => {
    const all: { title: string; category: string; hint: string; topic: string; count: number }[] = [];
    for (const q of approved) {
      const lines = Array.isArray(q.suggested_calc_lines) ? q.suggested_calc_lines : [];
      for (const l of lines) {
        const existing = all.find(a => a.title === l.title && a.category === l.category);
        if (existing) existing.count++;
        else all.push({ title: l.title, category: l.category, hint: l.estimate_hint, topic: q.topic, count: 1 });
      }
    }
    return all.sort((a, b) => b.count - a.count);
  }, [approved]);

  if (approved.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="p-5 border-b border-border/40">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          Godkjente maler
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Basert på {approved.length} godkjente fagforespørsler
        </p>
      </div>

      <Tabs defaultValue="reservations" className="p-4">
        <TabsList className="grid w-full grid-cols-3 h-8">
          <TabsTrigger value="reservations" className="text-xs gap-1">
            <FileText className="h-3 w-3" /> Forbehold
          </TabsTrigger>
          <TabsTrigger value="calclines" className="text-xs gap-1">
            <Plus className="h-3 w-3" /> Kalkylelinjer
          </TabsTrigger>
          <TabsTrigger value="notes" className="text-xs gap-1">
            <Wrench className="h-3 w-3" /> Fagnotater
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reservations" className="mt-3">
          {reservations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Ingen forbehold fra godkjente forespørsler</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {reservations.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-sm p-2 rounded-lg hover:bg-secondary/40 transition-colors">
                  <span className="text-accent/60 mt-0.5 shrink-0">•</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-muted-foreground">{r.text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[9px]">{r.topic}</Badge>
                      {r.count > 1 && <span className="text-[10px] text-muted-foreground">Brukt {r.count}×</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calclines" className="mt-3">
          {calcLines.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Ingen kalkylelinjer fra godkjente forespørsler</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {calcLines.map((l, i) => (
                <div key={i} className="flex items-start gap-2 text-sm p-2 rounded-lg hover:bg-secondary/40 transition-colors">
                  <span className="text-primary/60 mt-0.5 shrink-0">›</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{l.title}</span>
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      ({l.category === "labor" ? "Arbeid" : "Materiell"} · {l.hint})
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[9px]">{l.topic}</Badge>
                      {l.count > 1 && <span className="text-[10px] text-muted-foreground">Brukt {l.count}×</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="mt-3">
          {approved.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Ingen godkjente fagnotater</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {approved.slice(0, 10).map(q => (
                <div key={q.id} className="text-sm p-2 rounded-lg hover:bg-secondary/40 transition-colors">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge variant="outline" className="text-[9px]">{q.topic}</Badge>
                    <Badge variant="outline" className="text-[9px] bg-success/10 text-success border-success/20">Godkjent</Badge>
                  </div>
                  <p className="font-medium truncate">{q.question}</p>
                  {q.answer_summary && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{q.answer_summary}</p>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
