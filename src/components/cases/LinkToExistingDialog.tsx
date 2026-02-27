import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Wrench, FolderKanban, Users, FileText, Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";

interface LinkToExistingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  companyId: string;
  onLinked: (field: string, id: string) => void;
}

type TabKey = "job" | "project" | "lead" | "offer";

interface SearchResult {
  id: string;
  label: string;
  sub: string;
}

export function LinkToExistingDialog({ open, onOpenChange, caseId, companyId, onLinked }: LinkToExistingDialogProps) {
  const [tab, setTab] = useState<TabKey>("job");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);

  const doSearch = useCallback(async (q: string, t: TabKey) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      let items: SearchResult[] = [];
      switch (t) {
        case "job": {
          const { data } = await supabase
            .from("events")
            .select("id, title, internal_number, job_number, customer")
            .or(`title.ilike.%${q}%,internal_number.ilike.%${q}%,job_number.ilike.%${q}%,customer.ilike.%${q}%`)
            .is("deleted_at", null)
            .limit(20);
          items = (data || []).map((e: any) => ({
            id: e.id,
            label: e.title,
            sub: [e.internal_number || e.job_number, e.customer].filter(Boolean).join(" · "),
          }));
          break;
        }
        case "project": {
          const { data } = await supabase
            .from("events")
            .select("id, title, project_number, customer")
            .eq("project_type", "project")
            .or(`title.ilike.%${q}%,project_number.ilike.%${q}%,customer.ilike.%${q}%`)
            .is("deleted_at", null)
            .limit(20);
          items = (data || []).map((e: any) => ({
            id: e.id,
            label: e.title,
            sub: [e.project_number, e.customer].filter(Boolean).join(" · "),
          }));
          break;
        }
        case "lead": {
          const { data } = await supabase
            .from("leads")
            .select("id, company_name, contact_name, lead_ref_code")
            .or(`company_name.ilike.%${q}%,contact_name.ilike.%${q}%,lead_ref_code.ilike.%${q}%`)
            .limit(20);
          items = (data || []).map((l: any) => ({
            id: l.id,
            label: l.company_name || l.contact_name || "Ukjent",
            sub: l.lead_ref_code || "",
          }));
          break;
        }
        case "offer": {
          const { data } = await supabase
            .from("offers")
            .select("id, title, offer_number, customer_name")
            .or(`title.ilike.%${q}%,offer_number.ilike.%${q}%,customer_name.ilike.%${q}%`)
            .limit(20);
          items = (data || []).map((o: any) => ({
            id: o.id,
            label: o.title || o.customer_name || "Ukjent",
            sub: o.offer_number || "",
          }));
          break;
        }
      }
      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query, tab), 300);
    return () => clearTimeout(timer);
  }, [query, tab, doSearch]);

  useEffect(() => {
    if (open) { setQuery(""); setResults([]); }
  }, [open, tab]);

  const handleLink = async (result: SearchResult) => {
    setLinking(true);
    const fieldMap: Record<TabKey, string> = {
      job: "linked_work_order_id",
      project: "linked_project_id",
      lead: "linked_lead_id",
      offer: "linked_offer_id",
    };
    const field = fieldMap[tab];
    const { error } = await supabase
      .from("cases")
      .update({ [field]: result.id } as any)
      .eq("id", caseId);

    if (error) {
      toast.error("Kunne ikke koble: " + error.message);
    } else {
      // Log system item
      await supabase.from("case_items").insert({
        case_id: caseId,
        company_id: companyId,
        type: "system",
        subject: "Koblet til eksisterende",
        body_preview: `Koblet til ${tab}: ${result.label} (${result.sub})`,
      } as any);
      toast.success(`Koblet til ${result.label}`);
      onLinked(field, result.id);
      onOpenChange(false);
    }
    setLinking(false);
  };

  const tabConfig: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "job", label: "Jobb", icon: Wrench },
    { key: "project", label: "Prosjekt", icon: FolderKanban },
    { key: "lead", label: "Lead", icon: Users },
    { key: "offer", label: "Tilbud", icon: FileText },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Koble til eksisterende
          </DialogTitle>
          <DialogDescription>Søk og velg et eksisterende objekt å koble denne saken til.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as TabKey); setQuery(""); setResults([]); }}>
          <TabsList className="w-full">
            {tabConfig.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="flex-1 gap-1.5 text-xs">
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabConfig.map((t) => (
            <TabsContent key={t.key} value={t.key} className="mt-3">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={`Søk ${t.label.toLowerCase()}...`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
              <ScrollArea className="h-64">
                {searching ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : results.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {query.length < 2 ? "Skriv minst 2 tegn for å søke" : "Ingen resultater"}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => handleLink(r)}
                        disabled={linking}
                        className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                      >
                        <p className="text-sm font-medium text-foreground truncate">{r.label}</p>
                        {r.sub && <p className="text-xs text-muted-foreground mt-0.5">{r.sub}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
