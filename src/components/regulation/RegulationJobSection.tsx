import { useState, useEffect } from "react";
import { BookOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RegulationAnswerCard } from "./RegulationAnswerCard";
import { NewRegulationQueryDialog } from "./NewRegulationQueryDialog";
import { useRegulationQueries } from "@/hooks/useRegulationQueries";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  jobId: string;
  companyId?: string;
}

export function RegulationJobSection({ jobId, companyId }: Props) {
  const [newOpen, setNewOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { queries, loading, fetchQueries, togglePin, rateQuery, reviewQuery } = useRegulationQueries("job", jobId);
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    fetchQueries();
  }, [fetchQueries]);

  const handleReview = (id: string, status: "approved" | "rejected", comment?: string) => {
    if (user?.id) reviewQuery(id, status, user.id, comment);
  };

  const selected = selectedId ? queries.find(q => q.id === selectedId) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          Faglogg
        </h3>
        <Button variant="outline" size="sm" onClick={() => setNewOpen(true)} className="gap-1.5 h-7 text-xs rounded-xl">
          <Plus className="h-3 w-3" />
          Ny forespørsel
        </Button>
      </div>

      {selected ? (
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} className="gap-1 -ml-2 text-xs h-7">
            ← Tilbake
          </Button>
          <RegulationAnswerCard
            query={selected}
            onPin={togglePin}
            onRate={rateQuery}
            onReview={handleReview}
            canReview={isAdmin}
          />
        </div>
      ) : loading ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Laster…</p>
      ) : queries.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Ingen fagforespørsler for denne jobben
        </p>
      ) : (
        queries.map(q => (
          <RegulationAnswerCard
            key={q.id}
            query={q}
            compact
            onClick={() => setSelectedId(q.id)}
          />
        ))
      )}

      <NewRegulationQueryDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        scopeType="job"
        scopeId={jobId}
        companyId={companyId}
        onSaved={() => fetchQueries()}
      />
    </div>
  );
}
