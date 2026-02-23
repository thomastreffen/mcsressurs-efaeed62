import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, FileText, Loader2 } from "lucide-react";
import { getStatusLabel, getStatusColor, getReasonLabel } from "@/lib/change-order-labels";
import { CreateChangeOrderDialog } from "./CreateChangeOrderDialog";
import { ChangeOrderDetail } from "./ChangeOrderDetail";

interface ChangeOrder {
  id: string;
  title: string;
  description: string;
  reason_type: string;
  amount_ex_vat: number;
  amount_inc_vat: number;
  currency: string;
  status: string;
  sent_at: string | null;
  responded_at: string | null;
  created_at: string;
  schedule_impact: string | null;
  customer_name: string | null;
  customer_email: string | null;
  cost_material: number | null;
  cost_labor_hours: number | null;
  cost_labor_rate: number;
  cost_total: number | null;
  margin_amount: number | null;
  vat_rate: number;
  approved_by_name: string | null;
  response_message: string | null;
  approval_method: string | null;
}

interface ChangeOrderTabProps {
  jobId: string;
  customer?: string;
  customerEmail?: string;
  baseAmount: number | null;
  currency: string;
  onTotalsChange?: (approved: number, pending: number) => void;
}

export function ChangeOrderTab({ jobId, customer, customerEmail, baseAmount, currency, onTotalsChange }: ChangeOrderTabProps) {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from("job_change_orders")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    if (data) {
      setOrders(data as any);
      const approved = data.filter((o: any) => o.status === "approved" || o.status === "invoiced").reduce((s: number, o: any) => s + Number(o.amount_ex_vat), 0);
      const pending = data.filter((o: any) => o.status === "sent").reduce((s: number, o: any) => s + Number(o.amount_ex_vat), 0);
      onTotalsChange?.(approved, pending);
    }
    setLoading(false);
  }, [jobId, onTotalsChange]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const approvedTotal = orders.filter(o => o.status === "approved" || o.status === "invoiced").reduce((s, o) => s + Number(o.amount_ex_vat), 0);
  const pendingTotal = orders.filter(o => o.status === "sent").reduce((s, o) => s + Number(o.amount_ex_vat), 0);
  const rejectedTotal = orders.filter(o => o.status === "rejected").reduce((s, o) => s + Number(o.amount_ex_vat), 0);
  const totalNow = (baseAmount ?? 0) + approvedTotal;

  if (selectedId) {
    return (
      <ChangeOrderDetail
        changeOrderId={selectedId}
        jobId={jobId}
        onBack={() => { setSelectedId(null); fetchOrders(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/40 bg-card p-3 space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Baseverdi</p>
          <p className="text-sm font-bold font-mono">
            {baseAmount != null ? `${currency} ${baseAmount.toLocaleString("nb-NO")}` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-success/20 bg-success/5 p-3 space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Godkjente tillegg</p>
          <p className="text-sm font-bold font-mono text-success">
            {approvedTotal > 0 ? `+${currency} ${approvedTotal.toLocaleString("nb-NO")}` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-info/20 bg-info/5 p-3 space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Avventende</p>
          <p className="text-sm font-bold font-mono text-info">
            {pendingTotal > 0 ? `${currency} ${pendingTotal.toLocaleString("nb-NO")}` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Total nå</p>
          <p className="text-sm font-bold font-mono">
            {currency} {totalNow.toLocaleString("nb-NO")}
          </p>
        </div>
      </div>

      {/* Actions */}
      {isAdmin && (
        <div className="flex justify-end">
          <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Nytt tillegg
          </Button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-8">
          <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Ingen tillegg registrert.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(order => (
            <button
              key={order.id}
              className="w-full text-left rounded-xl border border-border/60 bg-card hover:bg-muted/30 transition-colors p-4 flex items-center gap-4"
              onClick={() => setSelectedId(order.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium truncate">{order.title}</span>
                  <Badge variant="outline" className={`text-[10px] h-5 ${getStatusColor(order.status)}`}>
                    {getStatusLabel(order.status)}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{getReasonLabel(order.reason_type)}</span>
                  {order.sent_at && <span>Sendt: {new Date(order.sent_at).toLocaleDateString("nb-NO")}</span>}
                  {order.responded_at && <span>Svar: {new Date(order.responded_at).toLocaleDateString("nb-NO")}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold font-mono">
                  {order.currency} {Number(order.amount_ex_vat).toLocaleString("nb-NO")}
                </p>
                <p className="text-[10px] text-muted-foreground">eks. mva</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Rejected summary */}
      {rejectedTotal > 0 && (
        <p className="text-xs text-muted-foreground pl-1">
          Avviste tillegg totalt: {currency} {rejectedTotal.toLocaleString("nb-NO")}
        </p>
      )}

      <CreateChangeOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        jobId={jobId}
        customer={customer}
        customerEmail={customerEmail}
        onCreated={() => { setCreateOpen(false); fetchOrders(); }}
      />
    </div>
  );
}
