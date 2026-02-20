import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { OFFER_STATUS_CONFIG, ALL_OFFER_STATUSES, type OfferStatus } from "@/lib/offer-status";
import { Search, FileText, Loader2, ExternalLink, Plus } from "lucide-react";

interface Offer {
  id: string;
  calculation_id: string;
  offer_number: string;
  version: number;
  status: OfferStatus;
  total_ex_vat: number;
  total_inc_vat: number;
  generated_pdf_url: string | null;
  sent_at: string | null;
  sent_to_email: string | null;
  created_at: string;
  calculations?: { customer_name: string; project_title: string } | null;
}

export default function OffersPage() {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("offers")
        .select("*, calculations(customer_name, project_title)")
        .order("created_at", { ascending: false });
      setOffers((data || []) as unknown as Offer[]);
      setLoading(false);
    })();
  }, []);

  const filtered = offers.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const customerName = o.calculations?.customer_name || "";
      const projectTitle = o.calculations?.project_title || "";
      return o.offer_number.toLowerCase().includes(s) ||
        customerName.toLowerCase().includes(s) ||
        projectTitle.toLowerCase().includes(s);
    }
    return true;
  });

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Tilbud</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} tilbud</p>
        </div>
        <Button onClick={() => navigate("/sales/offers/new")} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nytt tilbud
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Søk tilbudsnr, kunde, prosjekt..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statuser</SelectItem>
            {ALL_OFFER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{OFFER_STATUS_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tilbudsnr</TableHead>
              <TableHead>Kunde</TableHead>
              <TableHead>Prosjekt</TableHead>
              <TableHead>Versjon</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Eks. MVA</TableHead>
              <TableHead className="text-right">Inkl. MVA</TableHead>
              <TableHead>Dato</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Ingen tilbud funnet
                </TableCell>
              </TableRow>
            ) : filtered.map((offer) => (
              <TableRow key={offer.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/sales/calculations/${offer.calculation_id}`)}>
                <TableCell className="font-mono text-sm font-medium">{offer.offer_number}</TableCell>
                <TableCell className="text-sm">{offer.calculations?.customer_name || "—"}</TableCell>
                <TableCell className="text-sm">{offer.calculations?.project_title || "—"}</TableCell>
                <TableCell className="text-sm">v{offer.version}</TableCell>
                <TableCell>
                  <Badge className={OFFER_STATUS_CONFIG[offer.status]?.className}>{OFFER_STATUS_CONFIG[offer.status]?.label}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">kr {Number(offer.total_ex_vat).toLocaleString("nb-NO")}</TableCell>
                <TableCell className="text-right font-mono text-sm">kr {Number(offer.total_inc_vat).toLocaleString("nb-NO")}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{format(new Date(offer.created_at), "d. MMM yyyy", { locale: nb })}</TableCell>
                <TableCell>
                  {offer.generated_pdf_url && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); window.open(offer.generated_pdf_url!, "_blank"); }}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
