import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  AlertTriangle,
  Clock,
  TrendingUp,
  ChevronRight,
} from "lucide-react";

interface Props {
  jobId: string;
}

interface ActionItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
  tab?: string;
  severity: "red" | "yellow" | "muted";
}

const SEV_CLASSES: Record<string, string> = {
  red: "border-l-destructive/60",
  yellow: "border-l-[hsl(var(--accent))]/60",
  muted: "border-l-border",
};

export function ProjectPulseActions({ jobId }: Props) {
  const navigate = useNavigate();
  const [urgent, setUrgent] = useState<ActionItem[]>([]);
  const [econActions, setEconActions] = useState<ActionItem[]>([]);
  const [recentEvents, setRecentEvents] = useState<ActionItem[]>([]);

  const fetchActions = useCallback(async () => {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    const [cosRes, risksRes, coEventsRes] = await Promise.all([
      supabase.from("job_change_orders").select("id, title, status, created_at, amount_ex_vat").eq("job_id", jobId),
      supabase.from("job_risk_items").select("id, label, severity, status, category, created_at").eq("job_id", jobId),
      supabase.from("job_change_order_events").select("id, event_type, event_message, created_at, change_order_id").eq("job_id", jobId).order("created_at", { ascending: false }).limit(5),
    ]);

    const cos = cosRes.data || [];
    const risks = risksRes.data || [];
    const coEvents = coEventsRes.data || [];

    // ── HASTER NÅ ──
    const urgentItems: ActionItem[] = [];
    
    // Draft COs older than 3 days
    const oldDrafts = cos.filter(c => c.status === "draft" && new Date(c.created_at) < threeDaysAgo);
    for (const d of oldDrafts.slice(0, 2)) {
      urgentItems.push({
        id: `co-draft-${d.id}`,
        icon: <Clock className="h-3.5 w-3.5 text-destructive" />,
        label: `Utkast: ${d.title}`,
        detail: `Opprettet ${format(new Date(d.created_at), "d. MMM", { locale: nb })}`,
        tab: "tillegg",
        severity: "red",
      });
    }

    // Open HIGH risks older than 5 days
    const oldHighRisks = risks.filter(r =>
      r.severity === "high" && r.status === "open" &&
      r.category !== "documentation" &&
      new Date(r.created_at) < fiveDaysAgo
    );
    for (const r of oldHighRisks.slice(0, 2)) {
      urgentItems.push({
        id: `risk-${r.id}`,
        icon: <AlertTriangle className="h-3.5 w-3.5 text-destructive" />,
        label: r.label,
        detail: "HIGH risiko – ubehandlet",
        tab: "risiko",
        severity: "red",
      });
    }

    setUrgent(urgentItems.slice(0, 3));

    // ── UAVKLART ØKONOMI ──
    const econItems: ActionItem[] = [];
    
    const pendingCOs = cos.filter(c => c.status === "sent" || c.status === "pending");
    for (const c of pendingCOs.slice(0, 2)) {
      econItems.push({
        id: `co-pending-${c.id}`,
        icon: <TrendingUp className="h-3.5 w-3.5 text-[hsl(var(--accent))]" />,
        label: c.title,
        detail: `NOK ${Number(c.amount_ex_vat || 0).toLocaleString("nb-NO")} avventer`,
        tab: "tillegg",
        severity: "yellow",
      });
    }

    // Risks suggesting CO needed
    const coNeededRisks = risks.filter(r =>
      r.status === "open" &&
      r.category === "economic" &&
      r.severity !== "low"
    );
    for (const r of coNeededRisks.slice(0, 2)) {
      econItems.push({
        id: `risk-econ-${r.id}`,
        icon: <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--accent))]" />,
        label: r.label,
        detail: "Kan kreve tillegg",
        tab: "risiko",
        severity: "yellow",
      });
    }

    setEconActions(econItems.slice(0, 3));

    // ── SISTE HENDELSER ──
    const eventItems: ActionItem[] = coEvents.map(e => ({
      id: e.id,
      icon: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
      label: e.event_message || e.event_type,
      detail: format(new Date(e.created_at), "d. MMM HH:mm", { locale: nb }),
      tab: "tillegg",
      severity: "muted" as const,
    }));

    setRecentEvents(eventItems);
  }, [jobId]);

  useEffect(() => { fetchActions(); }, [fetchActions]);

  const hasContent = urgent.length > 0 || econActions.length > 0 || recentEvents.length > 0;
  if (!hasContent) return null;

  const renderList = (title: string, items: ActionItem[]) => {
    if (items.length === 0) return null;
    return (
      <div>
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">{title}</h4>
        <div className="space-y-1">
          {items.map(item => (
            <button
              key={item.id}
              className={`w-full text-left rounded-lg border border-border/40 border-l-[3px] ${SEV_CLASSES[item.severity]} bg-card hover:bg-muted/40 transition-colors px-3 py-2 flex items-center gap-2 group`}
              onClick={() => {
                if (item.tab) {
                  const params = new URLSearchParams(window.location.search);
                  params.set("tab", item.tab);
                  navigate(`?${params.toString()}`, { replace: true });
                }
              }}
            >
              {item.icon}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{item.label}</p>
                <p className="text-[10px] text-muted-foreground">{item.detail}</p>
              </div>
              <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {renderList("Haster nå", urgent)}
      {renderList("Uavklart økonomi", econActions)}
      {renderList("Siste hendelser", recentEvents)}
    </div>
  );
}
