import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { nb } from "date-fns/locale";
import { Loader2, TrendingUp, TrendingDown, Target, ReceiptText, ArrowRight, DollarSign, BarChart3 } from "lucide-react";
import { OFFER_STATUS_CONFIG, type OfferStatus } from "@/lib/offer-status";

interface SalesKpi {
  offersSentThisMonth: number;
  wonValue: number;
  lostValue: number;
  conversionRate: number;
  avgMargin: number;
  pipelineValue: number;
  recentOffers: { id: string; offer_number: string; status: OfferStatus; total_inc_vat: number; customer: string; created_at: string }[];
}

export default function SalesDashboard() {
  const navigate = useNavigate();
  const [kpi, setKpi] = useState<SalesKpi | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();

      const [offersRes, allOffersRes, leadsRes] = await Promise.all([
        supabase.from("offers").select("*, calculations(customer_name, total_material, total_labor, total_price)").gte("created_at", monthStart).lte("created_at", monthEnd),
        supabase.from("offers").select("*, calculations(customer_name, total_material, total_price)").order("created_at", { ascending: false }).limit(10),
        supabase.from("leads").select("estimated_value").not("status", "in", '("lost","won")'),
      ]);

      const monthOffers = offersRes.data || [];
      const sent = monthOffers.filter((o: any) => o.status !== "draft").length;
      const won = monthOffers.filter((o: any) => o.status === "accepted");
      const lost = monthOffers.filter((o: any) => o.status === "rejected");
      const wonValue = won.reduce((s: number, o: any) => s + Number(o.total_inc_vat), 0);
      const lostValue = lost.reduce((s: number, o: any) => s + Number(o.total_inc_vat), 0);
      const decided = won.length + lost.length;
      const conversionRate = decided > 0 ? (won.length / decided) * 100 : 0;

      // Pipeline = leads estimated + draft/sent offers
      const pipelineLeads = (leadsRes.data || []).reduce((s: number, l: any) => s + Number(l.estimated_value || 0), 0);
      const pipelineOffers = (allOffersRes.data || [])
        .filter((o: any) => o.status === "draft" || o.status === "sent")
        .reduce((s: number, o: any) => s + Number(o.total_inc_vat), 0);

      // Avg margin across won offers
      let avgMargin = 0;
      if (won.length > 0) {
        const margins = won.map((o: any) => {
          const cost = Number(o.calculations?.total_material || 0) / 2 + Number(o.calculations?.total_labor || 0);
          const price = Number(o.calculations?.total_price || 0);
          return price > 0 ? ((price - cost) / price) * 100 : 0;
        });
        avgMargin = margins.reduce((a: number, b: number) => a + b, 0) / margins.length;
      }

      const recentOffers = (allOffersRes.data || []).map((o: any) => ({
        id: o.id, offer_number: o.offer_number, status: o.status as OfferStatus,
        total_inc_vat: Number(o.total_inc_vat), customer: o.calculations?.customer_name || "",
        created_at: o.created_at,
      }));

      setKpi({ offersSentThisMonth: sent, wonValue, lostValue, conversionRate, avgMargin, pipelineValue: pipelineLeads + pipelineOffers, recentOffers });
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!kpi) return null;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          Salgsdashboard
        </h1>
        <p className="text-sm text-muted-foreground">{format(new Date(), "MMMM yyyy", { locale: nb })}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SalesKpiCard title="Tilbud sendt" value={kpi.offersSentThisMonth} icon={<ReceiptText className="h-4 w-4" />} />
        <SalesKpiCard title="Vunnet verdi" value={`kr ${(kpi.wonValue / 1000).toFixed(0)}k`} icon={<TrendingUp className="h-4 w-4" />} accent="text-green-600" />
        <SalesKpiCard title="Tapt verdi" value={`kr ${(kpi.lostValue / 1000).toFixed(0)}k`} icon={<TrendingDown className="h-4 w-4" />} accent="text-destructive" />
        <SalesKpiCard title="Konverteringsrate" value={`${kpi.conversionRate.toFixed(0)}%`} icon={<Target className="h-4 w-4" />} />
        <SalesKpiCard title="Snittmargin" value={`${kpi.avgMargin.toFixed(1)}%`} icon={<DollarSign className="h-4 w-4" />} />
        <SalesKpiCard title="Pipeline-verdi" value={`kr ${(kpi.pipelineValue / 1000).toFixed(0)}k`} icon={<BarChart3 className="h-4 w-4" />} accent="text-primary" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Siste tilbud</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/sales/offers")} className="gap-1 text-xs">
              Se alle <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {kpi.recentOffers.map((offer) => (
              <button
                key={offer.id}
                onClick={() => navigate("/sales/offers")}
                className="flex items-center gap-3 w-full rounded-lg border p-2.5 text-left hover:bg-secondary/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{offer.offer_number}</p>
                  <p className="text-xs text-muted-foreground truncate">{offer.customer}</p>
                </div>
                <span className="text-sm font-mono text-muted-foreground">
                  kr {offer.total_inc_vat.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
                </span>
                <Badge className={OFFER_STATUS_CONFIG[offer.status]?.className + " text-[10px]"}>
                  {OFFER_STATUS_CONFIG[offer.status]?.label}
                </Badge>
              </button>
            ))}
            {kpi.recentOffers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Ingen tilbud ennå</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SalesKpiCard({ title, value, icon, accent }: { title: string; value: string | number; icon: React.ReactNode; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`flex items-center gap-2 text-xs ${accent || "text-muted-foreground"} mb-1`}>
          {icon}
          {title}
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
