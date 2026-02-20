import { useState, useEffect } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, RotateCcw, Loader2, FolderKanban, Calculator, ReceiptText, Archive } from "lucide-react";
import { toast } from "sonner";

interface DeletedItem {
  id: string;
  title: string;
  subtitle?: string;
  deleted_at: string;
  type: "job" | "calculation" | "offer";
}

export default function TrashPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [operating, setOperating] = useState<string | null>(null);

  const fetchDeleted = async () => {
    setLoading(true);
    const [jobsRes, calcsRes, offersRes] = await Promise.all([
      supabase.from("events").select("id, title, customer, deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
      supabase.from("calculations").select("id, project_title, customer_name, deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
      supabase.from("offers").select("id, offer_number, deleted_at, calculations(customer_name)").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    ]);

    const all: DeletedItem[] = [];
    (jobsRes.data || []).forEach((j: any) => all.push({
      id: j.id, title: j.title, subtitle: j.customer, deleted_at: j.deleted_at, type: "job",
    }));
    (calcsRes.data || []).forEach((c: any) => all.push({
      id: c.id, title: c.project_title, subtitle: c.customer_name, deleted_at: c.deleted_at, type: "calculation",
    }));
    (offersRes.data || []).forEach((o: any) => all.push({
      id: o.id, title: o.offer_number, subtitle: (o.calculations as any)?.customer_name, deleted_at: o.deleted_at, type: "offer",
    }));
    all.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());
    setItems(all);
    setLoading(false);
  };

  useEffect(() => { fetchDeleted(); }, []);

  const restore = async (item: DeletedItem) => {
    setOperating(item.id);
    const table = item.type === "job" ? "events" : item.type === "calculation" ? "calculations" : "offers";
    await supabase.from(table).update({ deleted_at: null, deleted_by: null }).eq("id", item.id);
    toast.success("Gjenopprettet", { description: item.title });
    setItems(prev => prev.filter(i => i.id !== item.id));
    setOperating(null);
  };

  const permanentDelete = async (item: DeletedItem) => {
    setOperating(item.id);
    const table = item.type === "job" ? "events" : item.type === "calculation" ? "calculations" : "offers";
    await supabase.from(table).delete().eq("id", item.id);
    toast.success("Permanent slettet", { description: item.title });
    setItems(prev => prev.filter(i => i.id !== item.id));
    setOperating(null);
  };

  const filtered = activeTab === "all" ? items : items.filter(i => i.type === activeTab);

  const typeIcon = (type: string) => {
    if (type === "job") return <FolderKanban className="h-3.5 w-3.5" />;
    if (type === "calculation") return <Calculator className="h-3.5 w-3.5" />;
    return <ReceiptText className="h-3.5 w-3.5" />;
  };

  const typeLabel = (type: string) => {
    if (type === "job") return "Jobb";
    if (type === "calculation") return "Kalkulasjon";
    return "Tilbud";
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Trash2 className="h-5 w-5" /> Papirkurv
        </h1>
        <p className="text-sm text-muted-foreground">{items.length} slettede elementer</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">Alle ({items.length})</TabsTrigger>
          <TabsTrigger value="job" className="gap-1"><FolderKanban className="h-3 w-3" />Jobber ({items.filter(i => i.type === "job").length})</TabsTrigger>
          <TabsTrigger value="calculation" className="gap-1"><Calculator className="h-3 w-3" />Kalkulasjoner ({items.filter(i => i.type === "calculation").length})</TabsTrigger>
          <TabsTrigger value="offer" className="gap-1"><ReceiptText className="h-3 w-3" />Tilbud ({items.filter(i => i.type === "offer").length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          <Archive className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Papirkurven er tom</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Navn</TableHead>
                <TableHead>Detaljer</TableHead>
                <TableHead>Slettet</TableHead>
                <TableHead>Handlinger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(item => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Badge variant="outline" className="gap-1 text-xs">
                      {typeIcon(item.type)} {typeLabel(item.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium text-sm">{item.title}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.subtitle || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(item.deleted_at), "d. MMM yyyy HH:mm", { locale: nb })}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => restore(item)} disabled={operating === item.id} className="gap-1 h-7 text-xs">
                        {operating === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Gjenopprett
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" className="gap-1 h-7 text-xs" disabled={operating === item.id}>
                            <Trash2 className="h-3 w-3" /> Slett permanent
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Slett permanent?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Dette kan ikke angres. "{item.title}" vil bli permanent slettet fra systemet.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Avbryt</AlertDialogCancel>
                            <AlertDialogAction onClick={() => permanentDelete(item)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Slett permanent
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
