import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Loader2, Link2, Wrench, FolderKanban, Users, FileText } from "lucide-react";
import { toast } from "sonner";

interface LinkToExistingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  companyId: string;
  onLinked: (field: string, id: string) => void;
}

type LinkedType = "work_order" | "project" | "lead" | "offer";

interface SearchResult {
  id: string; // always UUID
  type: LinkedType;
  typeLabel: string;
  displayNumber: string;
  title: string;
  customer: string;
}

const TYPE_CONFIG: Record<LinkedType, { label: string; icon: React.ElementType; field: string; badgeClass: string }> = {
  work_order: { label: "Jobb", icon: Wrench, field: "linked_work_order_id", badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  project: { label: "Prosjekt", icon: FolderKanban, field: "linked_project_id", badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  lead: { label: "Lead", icon: Users, field: "linked_lead_id", badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  offer: { label: "Tilbud", icon: FileText, field: "linked_offer_id", badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
};

function normalizeQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^(job|jobb|pro|project|prosjekt|lead|offer|tilbud|mcs)[- ]*/i, "")
    .trim();
}

export function LinkToExistingDialog({ open, onOpenChange, caseId, companyId, onLinked }: LinkToExistingDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);

    const norm = normalizeQuery(q);
    const like = `%${norm}%`;
    const origLike = `%${q.trim()}%`;

    try {
      const [jobsRes, projectsRes, leadsRes, offersRes] = await Promise.all([
        // Jobs (work_orders = events with project_type != 'project')
        supabase
          .from("events")
          .select("id, title, internal_number, job_number, customer")
          .or(`title.ilike.${like},internal_number.ilike.${like},job_number.ilike.${like},customer.ilike.${like},title.ilike.${origLike},internal_number.ilike.${origLike},job_number.ilike.${origLike},customer.ilike.${origLike}`)
          .neq("project_type", "project")
          .is("deleted_at", null)
          .limit(8),
        // Projects
        supabase
          .from("events")
          .select("id, title, project_number, customer")
          .eq("project_type", "project")
          .or(`title.ilike.${like},project_number.ilike.${like},customer.ilike.${like},title.ilike.${origLike},project_number.ilike.${origLike},customer.ilike.${origLike}`)
          .is("deleted_at", null)
          .limit(8),
        // Leads
        supabase
          .from("leads")
          .select("id, company_name, contact_name, lead_ref_code")
          .or(`company_name.ilike.${like},contact_name.ilike.${like},lead_ref_code.ilike.${like},company_name.ilike.${origLike},contact_name.ilike.${origLike},lead_ref_code.ilike.${origLike}`)
          .limit(8),
        // Offers
        supabase
          .from("offers")
          .select("id, offer_number, calculation:calculations(project_title, customer_name)")
          .or(`offer_number.ilike.${like},offer_number.ilike.${origLike}`)
          .is("deleted_at", null)
          .limit(8),
      ]);

      const items: SearchResult[] = [];

      (jobsRes.data || []).forEach((e: any) => items.push({
        id: e.id,
        type: "work_order",
        typeLabel: "Jobb",
        displayNumber: e.internal_number || e.job_number || "",
        title: e.title || "",
        customer: e.customer || "",
      }));

      (projectsRes.data || []).forEach((e: any) => items.push({
        id: e.id,
        type: "project",
        typeLabel: "Prosjekt",
        displayNumber: e.project_number || "",
        title: e.title || "",
        customer: e.customer || "",
      }));

      (leadsRes.data || []).forEach((l: any) => items.push({
        id: l.id,
        type: "lead",
        typeLabel: "Lead",
        displayNumber: l.lead_ref_code || "",
        title: l.company_name || l.contact_name || "Ukjent",
        customer: l.contact_name || "",
      }));

      (offersRes.data || []).forEach((o: any) => {
        const calc = o.calculation;
        items.push({
          id: o.id,
          type: "offer",
          typeLabel: "Tilbud",
          displayNumber: o.offer_number || "",
          title: calc?.project_title || o.offer_number || "Ukjent",
          customer: calc?.customer_name || "",
        });
      });

      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  useEffect(() => {
    if (open) { setQuery(""); setResults([]); }
  }, [open]);

  const handleLink = async (result: SearchResult) => {
    setLinking(true);
    const config = TYPE_CONFIG[result.type];

    const { error } = await supabase
      .from("cases")
      .update({ [config.field]: result.id } as any)
      .eq("id", caseId);

    if (error) {
      console.error("Link error:", { field: config.field, id: result.id, error });
      toast.error("Kunne ikke koble saken. Prøv igjen eller kontakt administrator.");
    } else {
      try {
        await supabase.from("case_items").insert({
          case_id: caseId,
          company_id: companyId,
          type: "system",
          subject: "Koblet til eksisterende",
          body_preview: `Manuelt koblet til ${config.label}: ${result.title} (${result.displayNumber})`,
        } as any);
      } catch { /* ignore logging errors */ }

      const display = [result.displayNumber, result.title].filter(Boolean).join(" – ");
      toast.success(`Saken er koblet til ${display}`);
      onLinked(config.field, result.id);
      onOpenChange(false);
    }
    setLinking(false);
  };

  // Group results by type
  const grouped = results.reduce<Record<LinkedType, SearchResult[]>>((acc, r) => {
    (acc[r.type] = acc[r.type] || []).push(r);
    return acc;
  }, {} as any);

  const typeOrder: LinkedType[] = ["work_order", "project", "lead", "offer"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Koble til eksisterende
          </DialogTitle>
          <DialogDescription>Søk på nummer, tittel eller kundenavn.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk jobb, prosjekt, lead, tilbud..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <ScrollArea className="h-72">
          {searching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {query.length < 2 ? "Skriv minst 2 tegn for å søke" : "Ingen resultater"}
            </p>
          ) : (
            <div className="space-y-4">
              {typeOrder.map((type) => {
                const items = grouped[type];
                if (!items?.length) return null;
                const cfg = TYPE_CONFIG[type];
                const Icon = cfg.icon;
                return (
                  <div key={type}>
                    <div className="flex items-center gap-1.5 px-1 mb-1.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{cfg.label}</span>
                    </div>
                    <div className="space-y-1">
                      {items.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => handleLink(r)}
                          disabled={linking}
                          className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${cfg.badgeClass}`}>
                              {r.typeLabel}
                            </Badge>
                            {r.displayNumber && (
                              <span className="text-xs font-mono text-muted-foreground">{r.displayNumber}</span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-foreground truncate mt-1">{r.title}</p>
                          {r.customer && <p className="text-xs text-muted-foreground mt-0.5">{r.customer}</p>}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
