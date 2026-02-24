import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveLeads } from "@/lib/lead-queries";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { OFFER_STATUS_CONFIG, type OfferStatus } from "@/lib/offer-status";
import { PIPELINE_STAGES, LEAD_STATUS_CONFIG, type LeadStatus } from "@/lib/lead-status";
import { SalesPulse } from "@/components/dashboard/SalesPulse";

interface RecentOffer {
  id: string;
  offer_number: string;
  status: OfferStatus;
  total_inc_vat: number;
  customer: string;
  lead_id: string | null;
  created_at: string;
}

interface RecentLead {
  id: string;
  company_name: string;
  status: LeadStatus;
  ref_code: string | null;
  updated_at: string;
}

export default function SalesDashboard() {
  const nav = useNavigate();
  const [recentOffers, setRecentOffers] = useState<RecentOffer[]>([]);
  const [recentLeads, setRecentLeads] = useState<RecentLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const leadsRes = await fetchActiveLeads("id, company_name, status, lead_ref_code, updated_at");
      const [offersRes] = await Promise.all([
        supabase
          .from("offers")
          .select("id, offer_number, status, total_inc_vat, created_at, lead_id, calculations(customer_name)")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      setRecentOffers(
        (offersRes.data || []).map((o: any) => ({
          id: o.id,
          offer_number: o.offer_number,
          status: o.status as OfferStatus,
          total_inc_vat: Number(o.total_inc_vat),
          customer: o.calculations?.customer_name || "",
          lead_id: o.lead_id,
          created_at: o.created_at,
        }))
      );

      setRecentLeads(
        (leadsRes.data || [])
          .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
          .slice(0, 6)
          .map((l: any) => ({
            id: l.id,
            company_name: l.company_name,
            status: l.status as LeadStatus,
            ref_code: l.lead_ref_code,
            updated_at: l.updated_at,
          }))
      );

      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <SalesPulse />

      {/* ── Recent offers + leads ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 px-4 sm:px-5 pb-6">
        {/* Siste tilbud */}
        <div className="rounded-xl bg-card shadow-sm p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Siste tilbud</h4>
            <button
              onClick={() => nav("/sales/offers")}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium
                         text-muted-foreground px-3 py-1.5 rounded-lg
                         border border-border/30
                         hover:bg-secondary/50 hover:text-foreground
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
                         transition-all duration-150 cursor-pointer"
            >
              Se alle <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {loading ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3].map(i => <div key={i} className="h-11 bg-muted/50 rounded-lg" />)}
            </div>
          ) : recentOffers.length === 0 ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <p className="text-sm text-muted-foreground/70">Ingen tilbud ennå</p>
              <button
                onClick={() => nav("/sales/offers")}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary
                           px-4 py-2 rounded-lg border border-primary/20
                           hover:bg-primary/10 transition-all duration-150 cursor-pointer"
              >
                Opprett tilbud <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {recentOffers.map((offer) => (
                <button
                  key={offer.id}
                  onClick={() => nav(`/sales/offers/${offer.id}`)}
                  className="flex items-center gap-2.5 py-2.5 px-2 w-full text-left
                             rounded-lg hover:bg-secondary/40
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
                             transition-all duration-150 cursor-pointer group"
                  aria-label={`Tilbud ${offer.offer_number}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate font-mono group-hover:text-foreground/90">{offer.offer_number}</p>
                    <p className="text-[11px] text-muted-foreground/70 truncate">{offer.customer}</p>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground shrink-0">
                    kr {offer.total_inc_vat.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
                  </span>
                  <Badge className={OFFER_STATUS_CONFIG[offer.status]?.className + " text-[9px] shrink-0"}>
                    {OFFER_STATUS_CONFIG[offer.status]?.label}
                  </Badge>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Siste leads */}
        <div className="rounded-xl bg-card shadow-sm p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Siste leads</h4>
            <button
              onClick={() => nav("/sales/leads")}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium
                         text-muted-foreground px-3 py-1.5 rounded-lg
                         border border-border/30
                         hover:bg-secondary/50 hover:text-foreground
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
                         transition-all duration-150 cursor-pointer"
            >
              Se alle <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {loading ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3].map(i => <div key={i} className="h-11 bg-muted/50 rounded-lg" />)}
            </div>
          ) : recentLeads.length === 0 ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <p className="text-sm text-muted-foreground/70">Ingen leads ennå</p>
              <button
                onClick={() => nav("/sales/leads")}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary
                           px-4 py-2 rounded-lg border border-primary/20
                           hover:bg-primary/10 transition-all duration-150 cursor-pointer"
              >
                Opprett første lead <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {recentLeads.map((lead) => {
                const stageColor = PIPELINE_STAGES.find(s => s.key === lead.status)?.color || "hsl(210, 10%, 60%)";
                return (
                  <button
                    key={lead.id}
                    onClick={() => nav(`/sales/leads/${lead.id}`)}
                    className="flex items-center gap-2.5 py-2.5 px-2 w-full text-left
                               rounded-lg hover:bg-secondary/40
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
                               transition-all duration-150 cursor-pointer group"
                    aria-label={`Lead: ${lead.company_name}`}
                  >
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stageColor }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-foreground/90">{lead.company_name}</p>
                      {lead.ref_code && <p className="text-[10px] text-muted-foreground/50 font-mono">{lead.ref_code}</p>}
                    </div>
                    <Badge className={LEAD_STATUS_CONFIG[lead.status]?.className + " text-[9px] shrink-0"}>
                      {LEAD_STATUS_CONFIG[lead.status]?.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0 whitespace-nowrap">
                      {formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true, locale: nb })}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
