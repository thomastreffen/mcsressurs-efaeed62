import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { ChevronRight } from "lucide-react";

interface Props {
  jobId: string;
}

interface ActionItem {
  id: string;
  label: string;
  detail: string;
  tab?: string;
  dot: "red" | "yellow" | "muted";
}

const DOT: Record<string, string> = {
  red: "bg-destructive",
  yellow: "bg-[hsl(var(--accent))]",
  muted: "bg-border",
};

export function ProjectPulseActions({ jobId }: Props) {
  const navigate = useNavigate();
  const [urgent, setUrgent] = useState<ActionItem[]>([]);
  const [econ, setEcon] = useState<ActionItem[]>([]);
  const [events, setEvents] = useState<ActionItem[]>([]);

  const fetch = useCallback(async () => {
    const now = Date.now();
    const d3 = new Date(now - 3 * 86_400_000);
    const d5 = new Date(now - 5 * 86_400_000);

    const [cosRes, risksRes, evRes] = await Promise.all([
      supabase.from("job_change_orders").select("id, title, status, created_at, amount_ex_vat").eq("job_id", jobId),
      supabase.from("job_risk_items").select("id, label, severity, status, category, created_at").eq("job_id", jobId),
      supabase.from("job_change_order_events").select("id, event_type, event_message, created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(5),
    ]);

    const cos = cosRes.data || [];
    const risks = risksRes.data || [];

    // Urgent
    const u: ActionItem[] = [];
    for (const c of cos.filter(c => c.status === "draft" && new Date(c.created_at) < d3).slice(0, 2)) {
      u.push({ id: `d-${c.id}`, label: c.title, detail: `Utkast ${format(new Date(c.created_at), "d. MMM", { locale: nb })}`, tab: "tillegg", dot: "red" });
    }
    for (const r of risks.filter(r => r.severity === "high" && r.status === "open" && r.category !== "documentation" && new Date(r.created_at) < d5).slice(0, 2)) {
      u.push({ id: `r-${r.id}`, label: r.label, detail: "HIGH – ubehandlet", tab: "risiko", dot: "red" });
    }
    setUrgent(u.slice(0, 3));

    // Econ
    const e: ActionItem[] = [];
    for (const c of cos.filter(c => c.status === "sent" || c.status === "pending").slice(0, 2)) {
      e.push({ id: `p-${c.id}`, label: c.title, detail: `NOK ${Number(c.amount_ex_vat || 0).toLocaleString("nb-NO")}`, tab: "tillegg", dot: "yellow" });
    }
    for (const r of risks.filter(r => r.status === "open" && r.category === "economic" && r.severity !== "low").slice(0, 2)) {
      e.push({ id: `re-${r.id}`, label: r.label, detail: "Kan kreve tillegg", tab: "risiko", dot: "yellow" });
    }
    setEcon(e.slice(0, 3));

    // Events
    setEvents((evRes.data || []).map(ev => ({
      id: ev.id,
      label: ev.event_message || ev.event_type,
      detail: format(new Date(ev.created_at), "d. MMM HH:mm", { locale: nb }),
      tab: "tillegg",
      dot: "muted" as const,
    })));
  }, [jobId]);

  useEffect(() => { fetch(); }, [fetch]);

  const sections = [
    { title: "Haster nå", items: urgent },
    { title: "Uavklart økonomi", items: econ },
    { title: "Siste hendelser", items: events },
  ].filter(s => s.items.length > 0);

  if (sections.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {sections.map(s => (
        <div key={s.title}>
          <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5">{s.title}</h4>
          <div className="space-y-0.5">
            {s.items.map(item => (
              <button
                key={item.id}
                className="w-full text-left rounded-lg hover:bg-muted/50 transition-colors px-2.5 py-1.5 flex items-center gap-2 group"
                onClick={() => {
                  if (item.tab) {
                    const p = new URLSearchParams(window.location.search);
                    p.set("tab", item.tab);
                    navigate(`?${p.toString()}`, { replace: true });
                  }
                }}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${DOT[item.dot]} shrink-0`} />
                <span className="min-w-0 flex-1 truncate text-xs">{item.label}</span>
                <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">{item.detail}</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
