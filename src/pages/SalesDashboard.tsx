import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { OFFER_STATUS_CONFIG, type OfferStatus } from "@/lib/offer-status";
import { SalesPulse } from "@/components/dashboard/SalesPulse";

interface RecentOffer {
  id: string;
  offer_number: string;
  status: OfferStatus;
  total_inc_vat: number;
  customer: string;
  created_at: string;
}

export default function SalesDashboard() {
  const navigate = useNavigate();
  const [recentOffers, setRecentOffers] = useState<RecentOffer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("offers")
        .select("id, offer_number, status, total_inc_vat, created_at, calculations(customer_name)")
        .order("created_at", { ascending: false })
        .limit(8);

      setRecentOffers(
        (data || []).map((o: any) => ({
          id: o.id,
          offer_number: o.offer_number,
          status: o.status as OfferStatus,
          total_inc_vat: Number(o.total_inc_vat),
          customer: o.calculations?.customer_name || "",
          created_at: o.created_at,
        }))
      );
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* ── Sales-Puls top section ── */}
      <SalesPulse />

      {/* ── Recent offers ── */}
      <div className="px-4 sm:px-6 pb-6">
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
            {loading ? (
              <div className="space-y-2 animate-pulse">
                {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {recentOffers.map((offer) => (
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
                {recentOffers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Ingen tilbud ennå</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
