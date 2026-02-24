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
    <div className="space-y-2 max-w-7xl mx-auto">
      <SalesPulse />

      {/* ── Recent offers + leads ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 px-4 sm:px-5 pb-5">
        {/* Siste tilbud */}
        <div className="rounded-xl bg-card shadow-sm p-3.5 sm:p-4">
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Siste tilbud</h4>
            <button
              onClick={() => nav("/sales/offers")}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium
                         text-muted-foreground px-3 py-1.5 rounded-lg
                         border border-border/30
                         hover:bg-secondary/50 hover:text-foreground
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
                         active:scale-[0.97]
                         transition-all duration-150 cursor-pointer"
            >
              Se alle <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {loading ? (
            <div className="space-y-1.5 animate-pulse">
              {[1, 2, 3].map(i => <div key={i} className="h-11 bg-muted/50 rounded-lg" />)}
            </div>
          ) : recentOffers.length === 0 ? (
            <div className="flex flex-col items-center py-5 gap-2">
              <p className="text-xs text-muted-foreground/60">Ingen tilbud ennå</p>
              <button
                onClick={() => nav("/sales/offers")}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary
                           px-4 py-2 rounded-lg border border-primary/20
                           hover:bg-primary/10 active:scale-[0.97] transition-all duration-150 cursor-pointer"
              >
                Opprett tilbud <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-0">
              {recentOffers.map((offer) => (
                <button
                  key={offer.id}
                  onClick={() => nav(`/sales/offers/${offer.id}`)}
                  className="flex items-center gap-2.5 py-2.5 px-2 w-full text-left
                             rounded-lg hover:bg-secondary/40 hover:translate-x-0.5
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
                             active:scale-[0.99]
                             transition-all duration-150 cursor-pointer group"
                  aria-label={`Tilbud ${offer.offer_number}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate font-mono group-hover:text-foreground">{offer.offer_number}</p>
                    <p className="text-[10px] text-muted-foreground/60 truncate">{offer.customer}</p>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground/70 shrink-0">
                    kr {offer.total_inc_vat.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
                  </span>
                  <Badge className={OFFER_STATUS_CONFIG[offer.status]?.className + " text-[9px] shrink-0"}>
                    {OFFER_STATUS_CONFIG[offer.status]?.label}
                  </Badge>
                  <span className="text-[9px] text-muted-foreground/50 shrink-0 whitespace-nowrap hidden sm:inline">
                    {formatDistanceToNow(new Date(offer.created_at), { addSuffix: true, locale: nb })}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/0 group-hover:text-primary/50 transition-all shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Siste leads */}
        <div className="rounded-xl bg-card shadow-sm p-3.5 sm:p-4">
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Siste leads</h4>
            <button
              onClick={() => nav("/sales/leads")}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium
                         text-muted-foreground px-3 py-1.5 rounded-lg
                         border border-border/30
                         hover:bg-secondary/50 hover:text-foreground
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
                         active:scale-[0.97]
                         transition-all duration-150 cursor-pointer"
            >
              Se alle <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {loading ? (
            <div className="space-y-1.5 animate-pulse">
              {[1, 2, 3].map(i => <div key={i} className="h-11 bg-muted/50 rounded-lg" />)}
            </div>
          ) : recentLeads.length === 0 ? (
            <div className="flex flex-col items-center py-5 gap-2">
              <p className="text-xs text-muted-foreground/60">Ingen leads ennå</p>
              <button
                onClick={() => nav("/sales/leads")}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary
                           px-4 py-2 rounded-lg border border-primary/20
                           hover:bg-primary/10 active:scale-[0.97] transition-all duration-150 cursor-pointer"
              >
                Opprett første lead <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-0">
              {recentLeads.map((lead) => {
                const stageColor = PIPELINE_STAGES.find(s => s.key === lead.status)?.color || "hsl(210, 10%, 60%)";
                return (
                  <button
                    key={lead.id}
                    onClick={() => nav(`/sales/leads/${lead.id}`)}
                    className="flex items-center gap-2.5 py-2.5 px-2 w-full text-left
                               rounded-lg hover:bg-secondary/40 hover:translate-x-0.5
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
                               active:scale-[0.99]
                               transition-all duration-150 cursor-pointer group"
                    aria-label={`Lead: ${lead.company_name}`}
                  >
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stageColor }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate group-hover:text-foreground">{lead.company_name}</p>
                      {lead.ref_code && <p className="text-[9px] text-muted-foreground/40 font-mono">{lead.ref_code}</p>}
                    </div>
                    <Badge className={LEAD_STATUS_CONFIG[lead.status]?.className + " text-[9px] shrink-0"}>
                      {LEAD_STATUS_CONFIG[lead.status]?.label}
                    </Badge>
                    <span className="text-[9px] text-muted-foreground/50 shrink-0 whitespace-nowrap">
                      {formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true, locale: nb })}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground/0 group-hover:text-primary/50 transition-all shrink-0" />
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
