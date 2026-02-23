import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Send, Loader2, Ban, CheckCircle } from "lucide-react";
import { getStatusLabel, getStatusColor, getReasonLabel } from "@/lib/change-order-labels";

interface ChangeOrderEvent {
  id: string;
  event_type: string;
  event_message: string | null;
  actor_type: string;
  actor_name: string | null;
  created_at: string;
}

interface Props {
  changeOrderId: string;
  jobId: string;
  onBack: () => void;
}

export function ChangeOrderDetail({ changeOrderId, jobId, onBack }: Props) {
  const { user, isAdmin } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [events, setEvents] = useState<ChangeOrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetch = useCallback(async () => {
    const [{ data: co }, { data: ev }] = await Promise.all([
      supabase.from("job_change_orders").select("*").eq("id", changeOrderId).single(),
      supabase.from("job_change_order_events").select("*").eq("change_order_id", changeOrderId).order("created_at", { ascending: true }),
    ]);
    setOrder(co);
    setEvents((ev as any) || []);
    setLoading(false);
  }, [changeOrderId]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSend = async () => {
    setActionLoading(true);
    const { error } = await supabase.functions.invoke("send-change-order", {
      body: { change_order_id: changeOrderId },
    });
    if (error) {
      toast.error("Sending feilet", { description: String(error) });
    } else {
      toast.success("Sendt til kunde");
      fetch();
    }
    setActionLoading(false);
  };

  const handleCancel = async () => {
    setActionLoading(true);
    await supabase.from("job_change_orders").update({ status: "cancelled" } as any).eq("id", changeOrderId);
    await supabase.from("job_change_order_events").insert({
      change_order_id: changeOrderId,
      job_id: jobId,
      event_type: "cancelled",
      event_message: "Tillegget ble kansellert",
      actor_type: "user",
      actor_name: user?.name || null,
      actor_email: user?.email || null,
    } as any);
    toast.success("Tillegg kansellert");
    fetch();
    setActionLoading(false);
  };

  const handleMarkInvoiced = async () => {
    setActionLoading(true);
    await supabase.from("job_change_orders").update({ status: "invoiced" } as any).eq("id", changeOrderId);
    await supabase.from("job_change_order_events").insert({
      change_order_id: changeOrderId,
      job_id: jobId,
      event_type: "invoiced",
      event_message: "Tillegget er markert som fakturert",
      actor_type: "user",
      actor_name: user?.name || null,
      actor_email: user?.email || null,
    } as any);
    toast.success("Markert som fakturert");
    fetch();
    setActionLoading(false);
  };

  if (loading || !order) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{order.title}</h3>
            <Badge variant="outline" className={`text-[10px] h-5 ${getStatusColor(order.status)}`}>
              {getStatusLabel(order.status)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{getReasonLabel(order.reason_type)}</p>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border/40 bg-card p-3 space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Beløp eks. mva</p>
          <p className="text-sm font-bold font-mono">{order.currency} {Number(order.amount_ex_vat).toLocaleString("nb-NO")}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-card p-3 space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Inkl. mva</p>
          <p className="text-sm font-bold font-mono">{order.currency} {Number(order.amount_inc_vat).toLocaleString("nb-NO")}</p>
        </div>
        {order.cost_total != null && (
          <div className="rounded-xl border border-border/40 bg-card p-3 space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Margin</p>
            <p className="text-sm font-bold font-mono">
              {order.currency} {Number(order.margin_amount).toLocaleString("nb-NO")}
            </p>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Beskrivelse</p>
        <p className="text-sm whitespace-pre-wrap">{order.description}</p>
        {order.schedule_impact && (
          <p className="text-xs text-muted-foreground">Fremdriftskonsekvens: {order.schedule_impact}</p>
        )}
      </div>

      {/* Customer info */}
      {(order.customer_name || order.customer_email) && (
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Kunde</p>
          {order.customer_name && <p className="text-sm">{order.customer_name}</p>}
          {order.customer_email && <p className="text-xs text-muted-foreground">{order.customer_email}</p>}
          {order.approved_by_name && <p className="text-xs text-success mt-1">Godkjent av: {order.approved_by_name}</p>}
          {order.response_message && <p className="text-xs text-muted-foreground mt-1">Melding: {order.response_message}</p>}
        </div>
      )}

      {/* Actions */}
      {isAdmin && (
        <div className="flex gap-2 flex-wrap">
          {order.status === "draft" && (
            <Button size="sm" className="gap-1.5 rounded-xl" onClick={handleSend} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send til kunde
            </Button>
          )}
          {order.status === "approved" && (
            <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={handleMarkInvoiced} disabled={actionLoading}>
              <CheckCircle className="h-3.5 w-3.5" />
              Marker fakturert
            </Button>
          )}
          {(order.status === "draft" || order.status === "sent") && (
            <Button size="sm" variant="outline" className="gap-1.5 rounded-xl text-destructive hover:text-destructive" onClick={handleCancel} disabled={actionLoading}>
              <Ban className="h-3.5 w-3.5" />
              Kanseller
            </Button>
          )}
        </div>
      )}

      {/* Event timeline */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Historikk</p>
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ingen hendelser registrert.</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {events.map(ev => (
              <div key={ev.id} className="flex items-start gap-2.5 text-sm">
                <div className="h-1.5 w-1.5 rounded-full bg-border mt-2 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm">{ev.event_message || ev.event_type}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {ev.actor_name && `${ev.actor_name} · `}
                    {new Date(ev.created_at).toLocaleString("nb-NO")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
