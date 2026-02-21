import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Plus, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NewRegulationQueryDialog } from "@/components/regulation/NewRegulationQueryDialog";
import { RegulationAnswerCard } from "@/components/regulation/RegulationAnswerCard";
import { RegulationLibrary } from "@/components/regulation/RegulationLibrary";
import { useRegulationQueries } from "@/hooks/useRegulationQueries";
import { useAuth } from "@/hooks/useAuth";
import type { RegulationQuery } from "@/hooks/useRegulationQueries";

const TOPICS = ["Alle", "NEK", "FEL", "FSE", "FSL", "Annet"];
const SCOPES = [
  { value: "all", label: "Alle typer" },
  { value: "global", label: "Globalt" },
  { value: "job", label: "Jobb" },
  { value: "quote", label: "Tilbud" },
  { value: "lead", label: "Lead" },
];
const REVIEW_FILTERS = [
  { value: "all", label: "Alle statuser" },
  { value: "approved", label: "Kun godkjente" },
  { value: "draft", label: "Utkast" },
  { value: "rejected", label: "Avvist" },
];

export default function RegulationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("id");
  const filterParam = searchParams.get("filter");
  const { user, isAdmin } = useAuth();

  const [newOpen, setNewOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("Alle");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState(filterParam || "all");
  const [prefillQuery, setPrefillQuery] = useState<RegulationQuery | null>(null);
  const [versions, setVersions] = useState<RegulationQuery[]>([]);

  const { queries, loading, fetchQueries, fetchVersions, togglePin, rateQuery, reviewQuery } = useRegulationQueries();

  useEffect(() => {
    fetchQueries();
  }, [fetchQueries]);

  useEffect(() => {
    if (filterParam && filterParam !== reviewFilter) {
      setReviewFilter(filterParam);
    }
  }, [filterParam]);

  // Load versions when a query is selected
  useEffect(() => {
    if (selectedId) {
      const q = queries.find(q => q.id === selectedId);
      if (q) {
        const rootId = q.parent_id || q.id;
        fetchVersions(rootId).then(setVersions);
      }
    } else {
      setVersions([]);
    }
  }, [selectedId, queries, fetchVersions]);

  const handleReview = (id: string, status: "approved" | "rejected", comment?: string) => {
    if (user?.id) reviewQuery(id, status, user.id, comment);
  };

  const handleCreateRevision = (query: RegulationQuery) => {
    setPrefillQuery(query);
    setNewOpen(true);
  };

  const handlePrefillNew = (query: RegulationQuery) => {
    setPrefillQuery(query);
    setNewOpen(true);
  };

  const filtered = useMemo(() => {
    let result = [...queries];
    if (topicFilter !== "Alle") result = result.filter(q => q.topic === topicFilter);
    if (scopeFilter !== "all") result = result.filter(q => q.scope_type === scopeFilter);
    if (reviewFilter !== "all") result = result.filter(q => q.reviewed_status === reviewFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(q =>
        q.question.toLowerCase().includes(s) ||
        q.answer_summary?.toLowerCase().includes(s)
      );
    }
    result.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return result;
  }, [queries, topicFilter, scopeFilter, reviewFilter, search]);

  const selectedQuery = selectedId ? queries.find(q => q.id === selectedId) : null;

  return (
    <div className="w-full p-5 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Fag
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Forskriftsoppslag og faglig veiledning (NEK, FEL, FSE, FSL)
          </p>
        </div>
        <Button onClick={() => { setPrefillQuery(null); setNewOpen(true); }} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Ny forespørsel
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Søk i forespørsler…"
            className="pl-9"
          />
        </div>
        <Select value={topicFilter} onValueChange={setTopicFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TOPICS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SCOPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={reviewFilter} onValueChange={setReviewFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {REVIEW_FILTERS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {selectedQuery ? (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setSearchParams({})} className="gap-1.5 -ml-2">
            ← Tilbake til liste
          </Button>
          <RegulationAnswerCard
            query={selectedQuery}
            onPin={togglePin}
            onRate={rateQuery}
            onReview={handleReview}
            canReview={isAdmin}
            versions={versions}
            onSelectVersion={(id) => setSearchParams({ id })}
            onCreateRevision={handleCreateRevision}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <RegulationLibrary queries={queries} onPrefillNew={handlePrefillNew} />

          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Laster…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <p className="text-muted-foreground">
                  {queries.length === 0 ? "Ingen fagforespørsler ennå" : "Ingen treff"}
                </p>
                <Button variant="outline" onClick={() => setNewOpen(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Opprett første forespørsel
                </Button>
              </div>
            ) : (
              filtered.map(q => (
                <RegulationAnswerCard
                  key={q.id}
                  query={q}
                  compact
                  onClick={() => setSearchParams({ id: q.id })}
                />
              ))
            )}
          </div>
        </div>
      )}

      <NewRegulationQueryDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onSaved={() => fetchQueries()}
        prefillQuestion={prefillQuery?.question}
        prefillTopic={prefillQuery?.topic}
        parentId={prefillQuery?.reviewed_status === "rejected" ? (prefillQuery.parent_id || prefillQuery.id) : undefined}
      />
    </div>
  );
}
