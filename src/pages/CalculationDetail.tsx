import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CALCULATION_STATUS_CONFIG,
  ALL_CALCULATION_STATUSES,
  type CalculationStatus,
} from "@/lib/calculation-status";
import { OFFER_STATUS_CONFIG, ALL_OFFER_STATUSES, type OfferStatus } from "@/lib/offer-status";
import { ConvertToJobDialog } from "@/components/ConvertToJobDialog";
import {
  ArrowLeft, Loader2, Sparkles, FileDown, ArrowRightLeft, Plus, Trash2, Save,
  Building2, Mail, FileText, Brain, Package, Upload, X, Image as ImageIcon,
  AlertTriangle, Paperclip, Eye, EyeOff, ExternalLink, AlertCircle, ReceiptText,
} from "lucide-react";
import { toast } from "sonner";

interface CalcItem {
  id: string;
  calculation_id: string;
  type: "material" | "labor";
  title: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  suggested_by_ai: boolean;
}

interface Calculation {
  id: string;
  customer_name: string;
  customer_email: string | null;
  project_title: string;
  description: string | null;
  ai_analysis: any;
  total_material: number;
  total_labor: number;
  total_price: number;
  status: CalculationStatus;
  attachments: any[];
  created_at: string;
  updated_at: string;
}

interface Offer {
  id: string;
  offer_number: string;
  version: number;
  status: OfferStatus;
  total_ex_vat: number;
  total_inc_vat: number;
  generated_pdf_url: string | null;
  sent_at: string | null;
  sent_to_email: string | null;
  created_at: string;
}

export default function CalculationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const [calc, setCalc] = useState<Calculation | null>(null);
  const [items, setItems] = useState<CalcItem[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [settings, setSettings] = useState({ material_multiplier: 2.0, default_hour_rate: 1080 });
  const [showCost, setShowCost] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [calcChangedSinceOffer, setCalcChangedSinceOffer] = useState(false);

  // File upload
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCalc = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [calcRes, itemsRes, settingsRes, offersRes] = await Promise.all([
      supabase.from("calculations").select("*").eq("id", id).single(),
      supabase.from("calculation_items").select("*").eq("calculation_id", id).order("type").order("title"),
      supabase.from("settings").select("key, value"),
      supabase.from("offers").select("*").eq("calculation_id", id).order("created_at", { ascending: false }),
    ]);
    if (calcRes.data) setCalc(calcRes.data as unknown as Calculation);
    if (itemsRes.data) setItems(itemsRes.data as CalcItem[]);
    if (offersRes.data) setOffers(offersRes.data as unknown as Offer[]);
    if (settingsRes.data) {
      const s: any = { material_multiplier: 2.0, default_hour_rate: 1080 };
      settingsRes.data.forEach((row: any) => {
        if (row.key === "material_multiplier") s.material_multiplier = Number(row.value);
        if (row.key === "default_hour_rate") s.default_hour_rate = Number(row.value);
      });
      setSettings(s);
    }
    // Check if calc changed since last offer
    if (calcRes.data && offersRes.data && offersRes.data.length > 0) {
      const lastOffer = offersRes.data[0];
      const calcUpdated = new Date(calcRes.data.updated_at);
      const offerCreated = new Date(lastOffer.created_at);
      setCalcChangedSinceOffer(calcUpdated > offerCreated);
    } else {
      setCalcChangedSinceOffer(false);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchCalc(); }, [fetchCalc]);

  // Auto-save every 30s
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (!isAdmin || !calc) return;
    const interval = setInterval(async () => {
      if (itemsRef.current.length === 0) return;
      await saveItems(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [calc, isAdmin]);

  const recalcTotals = (updatedItems: CalcItem[]) => {
    const totalMaterial = updatedItems.filter((i) => i.type === "material").reduce((s, i) => s + i.total_price, 0);
    const totalLabor = updatedItems.filter((i) => i.type === "labor").reduce((s, i) => s + i.total_price, 0);
    return { total_material: totalMaterial, total_labor: totalLabor, total_price: totalMaterial + totalLabor };
  };

  const handleAiGenerate = async () => {
    if (!calc) return;
    if (!calc.description?.trim()) {
      toast.error("Legg til en beskrivelse av arbeidet før AI-analyse");
      return;
    }
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-calculation-ai", {
        body: {
          description: calc.description,
          project_title: calc.project_title,
          customer_name: calc.customer_name,
          material_multiplier: settings.material_multiplier,
          hour_rate: settings.default_hour_rate,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await supabase.from("calculations").update({ ai_analysis: data }).eq("id", calc.id);

      if (data.status === "insufficient_data") {
        setCalc((prev) => prev ? { ...prev, ai_analysis: data } : null);
        toast.warning("AI trenger mer informasjon", { description: "Se AI-analyse-fanen for detaljer" });
        setAiLoading(false);
        return;
      }

      await supabase.from("calculation_items").delete().eq("calculation_id", calc.id).eq("suggested_by_ai", true);
      const newItems: any[] = [];
      if (data.materials) {
        for (const m of data.materials) {
          const sellPrice = (m.unit_price || 0) * settings.material_multiplier;
          newItems.push({
            calculation_id: calc.id, type: "material", title: m.title, description: m.description || null,
            quantity: m.quantity || 1, unit: m.unit || "stk", unit_price: sellPrice,
            total_price: sellPrice * (m.quantity || 1), suggested_by_ai: true,
          });
        }
      }
      if (data.labor) {
        for (const l of data.labor) {
          newItems.push({
            calculation_id: calc.id, type: "labor", title: l.title, description: l.description || null,
            quantity: l.hours || 1, unit: "timer", unit_price: settings.default_hour_rate,
            total_price: (l.hours || 1) * settings.default_hour_rate, suggested_by_ai: true,
          });
        }
      }
      if (newItems.length > 0) await supabase.from("calculation_items").insert(newItems);
      const { data: allItems } = await supabase.from("calculation_items").select("*").eq("calculation_id", calc.id);
      if (allItems) {
        const totals = recalcTotals(allItems as CalcItem[]);
        await supabase.from("calculations").update(totals).eq("id", calc.id);
      }
      toast.success("AI-analyse fullført", { description: `${newItems.length} poster generert` });
      fetchCalc();
    } catch (err: any) {
      toast.error("AI-analyse feilet", { description: err.message || "Ukjent feil" });
    }
    setAiLoading(false);
  };

  const handleItemChange = (itemId: string, field: string, value: any) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const updated = { ...item, [field]: value };
    if (field === "quantity" || field === "unit_price") {
      updated.total_price = Number(updated.quantity) * Number(updated.unit_price);
    }
    setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
  };

  const saveItems = async (silent = false) => {
    if (!calc) return;
    for (const item of itemsRef.current) {
      await supabase.from("calculation_items").update({
        title: item.title, description: item.description, quantity: item.quantity,
        unit: item.unit, unit_price: item.unit_price, total_price: item.total_price,
      }).eq("id", item.id);
    }
    const totals = recalcTotals(itemsRef.current);
    await supabase.from("calculations").update(totals).eq("id", calc.id);
    setCalc((prev) => prev ? { ...prev, ...totals } : null);
    setLastSaved(new Date());
    if (!silent) toast.success("Kalkulasjon lagret");
  };

  const addItem = async (type: "material" | "labor") => {
    if (!calc) return;
    const { data } = await supabase.from("calculation_items").insert({
      calculation_id: calc.id, type, title: type === "material" ? "Nytt materiale" : "Ny arbeidspost",
      quantity: 1, unit: type === "material" ? "stk" : "timer",
      unit_price: type === "labor" ? settings.default_hour_rate : 0,
      total_price: type === "labor" ? settings.default_hour_rate : 0, suggested_by_ai: false,
    }).select().single();
    if (data) { setItems((prev) => [...prev, data as CalcItem]); toast.success("Post lagt til"); }
  };

  const deleteItem = async (itemId: string) => {
    await supabase.from("calculation_items").delete().eq("id", itemId);
    const updated = items.filter((i) => i.id !== itemId);
    setItems(updated);
    const totals = recalcTotals(updated);
    await supabase.from("calculations").update(totals).eq("id", calc!.id);
    setCalc((prev) => prev ? { ...prev, ...totals } : null);
    toast.success("Post slettet");
  };

  const handleStatusChange = async (status: CalculationStatus) => {
    if (!calc) return;
    await supabase.from("calculations").update({ status }).eq("id", calc.id);
    setCalc((prev) => prev ? { ...prev, status } : null);
    toast.success(`Status endret til ${CALCULATION_STATUS_CONFIG[status].label}`);
  };

  const handleGenerateOffer = async () => {
    if (!calc) return;
    setPdfLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-offer-pdf", {
        body: { calculation_id: calc.id, created_by: user?.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Tilbud ${data.offer_number || ""} v${data.version} opprettet`, {
        description: "Du finner det under Tilbud-fanen",
      });
      fetchCalc();
    } catch (err: any) {
      toast.error("Kunne ikke generere tilbud", { description: err.message });
    }
    setPdfLoading(false);
  };

  const handleOfferStatusChange = async (offerId: string, status: OfferStatus) => {
    await supabase.from("offers").update({ status }).eq("id", offerId);
    setOffers((prev) => prev.map((o) => o.id === offerId ? { ...o, status } : o));
    toast.success(`Tilbudsstatus endret til ${OFFER_STATUS_CONFIG[status].label}`);
    // If accepted, also update calculation
    if (status === "accepted") {
      await supabase.from("calculations").update({ status: "accepted" }).eq("id", calc!.id);
      setCalc((prev) => prev ? { ...prev, status: "accepted" as CalculationStatus } : null);
    }
  };

  // File upload
  const handleUpload = async () => {
    if (files.length === 0 || !calc) return;
    setUploading(true);
    const existing = Array.isArray(calc.attachments) ? calc.attachments : [];
    const newAtts: any[] = [];
    for (const file of files) {
      const path = `${calc.id}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("calculation-attachments").upload(path, file);
      if (error) { toast.error(`Feil: ${file.name}`); continue; }
      const { data: urlData } = supabase.storage.from("calculation-attachments").getPublicUrl(path);
      newAtts.push({ name: file.name, url: urlData.publicUrl, size: file.size });
    }
    const all = [...existing, ...newAtts];
    await supabase.from("calculations").update({ attachments: all }).eq("id", calc.id);
    setCalc((prev) => prev ? { ...prev, attachments: all } : null);
    setFiles([]);
    setUploading(false);
    if (newAtts.length > 0) toast.success(`${newAtts.length} filer lastet opp`);
  };

  const removeAttachment = async (url: string) => {
    if (!calc) return;
    const updated = (calc.attachments || []).filter((a: any) => a.url !== url);
    await supabase.from("calculations").update({ attachments: updated }).eq("id", calc.id);
    setCalc((prev) => prev ? { ...prev, attachments: updated } : null);
    toast.success("Vedlegg fjernet");
  };

  // Margin calculations
  const getCostPrice = (item: CalcItem) => {
    if (item.type === "material") return item.unit_price / settings.material_multiplier;
    return item.unit_price;
  };
  const getMargin = (item: CalcItem) => {
    if (item.type !== "material") return 0;
    const cost = getCostPrice(item) * item.quantity;
    return item.total_price - cost;
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!calc) return (
    <div className="flex items-center justify-center p-12">
      <div className="text-center space-y-2">
        <p className="text-lg font-medium">Kalkulasjon ikke funnet</p>
        <Button variant="outline" onClick={() => navigate("/calculations")}>Tilbake</Button>
      </div>
    </div>
  );

  const materials = items.filter((i) => i.type === "material");
  const labor = items.filter((i) => i.type === "labor");
  const analysis = calc.ai_analysis;
  const attachments = Array.isArray(calc.attachments) ? calc.attachments : [];

  const totalCost = materials.reduce((s, i) => s + getCostPrice(i) * i.quantity, 0) + Number(calc.total_labor);
  const totalMargin = Number(calc.total_price) - totalCost;
  const marginPercent = Number(calc.total_price) > 0 ? (totalMargin / Number(calc.total_price)) * 100 : 0;

  const confidenceColor = (level: string) => {
    if (level === "high") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (level === "medium") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  };

  const latestAcceptedOffer = offers.find((o) => o.status === "accepted");

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 pb-24 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/calculations")} className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Tilbake
        </Button>
        <div className="flex items-center gap-2">
          {lastSaved && <span className="text-xs text-muted-foreground">Sist lagret {format(lastSaved, "HH:mm")}</span>}
          {isAdmin && calc.status !== "converted" && (
            <Select value={calc.status} onValueChange={(v) => handleStatusChange(v as CalculationStatus)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_CALCULATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{CALCULATION_STATUS_CONFIG[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <header className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold">{calc.project_title}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{calc.customer_name}</span>
              {calc.customer_email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{calc.customer_email}</span>}
            </div>
          </div>
          <Badge className={CALCULATION_STATUS_CONFIG[calc.status]?.className + " text-sm"}>
            {CALCULATION_STATUS_CONFIG[calc.status]?.label}
          </Badge>
        </div>

        {/* Version warning */}
        {calcChangedSinceOffer && offers.length > 0 && isAdmin && (
          <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-800 dark:text-orange-200">Kalkylen er endret siden siste tilbud</p>
              <p className="text-xs text-orange-700 dark:text-orange-300">Generer ny versjon for å oppdatere tilbudet.</p>
            </div>
            <Button size="sm" variant="outline" onClick={handleGenerateOffer} disabled={pdfLoading} className="gap-1.5 shrink-0">
              {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              Ny versjon
            </Button>
          </div>
        )}

        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleAiGenerate} disabled={aiLoading} variant="outline" className="gap-1.5">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              AI-analyse
            </Button>
            <Button onClick={() => saveItems()} variant="outline" className="gap-1.5">
              <Save className="h-4 w-4" /> Lagre
            </Button>
            <Button onClick={handleGenerateOffer} disabled={pdfLoading || items.length === 0} variant="outline" className="gap-1.5">
              {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Generer tilbud
            </Button>
            {(calc.status === "accepted" || latestAcceptedOffer) && (
              <Button onClick={() => setConvertOpen(true)} className="gap-1.5">
                <ArrowRightLeft className="h-4 w-4" /> Konverter til prosjekt
              </Button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Materialer</p>
            <p className="text-lg font-bold">kr {Number(calc.total_material).toLocaleString("nb-NO")}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Arbeid</p>
            <p className="text-lg font-bold">kr {Number(calc.total_labor).toLocaleString("nb-NO")}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Totalt eks. MVA</p>
            <p className="text-lg font-bold text-primary">kr {Number(calc.total_price).toLocaleString("nb-NO")}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Totalt inkl. MVA</p>
            <p className="text-lg font-bold">kr {(Number(calc.total_price) * 1.25).toLocaleString("nb-NO")}</p>
          </div>
        </div>

        {/* Margin section - admin only */}
        {isAdmin && showCost && items.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-dashed bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">Totalkost</p>
              <p className="text-lg font-bold">kr {totalCost.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="rounded-lg border border-dashed bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">Dekningsbidrag</p>
              <p className="text-lg font-bold text-primary">kr {totalMargin.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="rounded-lg border border-dashed bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">Dekningsgrad</p>
              <p className="text-lg font-bold">{marginPercent.toFixed(1)}%</p>
            </div>
          </div>
        )}
      </header>

      <Tabs defaultValue="overview">
        <TabsList className="w-full sm:w-auto flex overflow-x-auto">
          <TabsTrigger value="overview" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Oversikt</TabsTrigger>
          <TabsTrigger value="attachments" className="gap-1.5"><Paperclip className="h-3.5 w-3.5" />Vedlegg {attachments.length > 0 && `(${attachments.length})`}</TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5"><Brain className="h-3.5 w-3.5" />AI Analyse</TabsTrigger>
          <TabsTrigger value="items" className="gap-1.5"><Package className="h-3.5 w-3.5" />Kalkylelinjer ({items.length})</TabsTrigger>
          <TabsTrigger value="offers" className="gap-1.5"><ReceiptText className="h-3.5 w-3.5" />Tilbud ({offers.length})</TabsTrigger>
        </TabsList>

        {/* ===== Overview Tab ===== */}
        <TabsContent value="overview" className="space-y-4 pt-4">
          {calc.description && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-medium mb-2">Beskrivelse</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{calc.description}</p>
            </div>
          )}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <h3 className="text-sm font-medium">Detaljer</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Opprettet:</span> {format(new Date(calc.created_at), "d. MMM yyyy HH:mm", { locale: nb })}</div>
              <div><span className="text-muted-foreground">Oppdatert:</span> {format(new Date(calc.updated_at), "d. MMM yyyy HH:mm", { locale: nb })}</div>
              <div><span className="text-muted-foreground">Materialfaktor:</span> {settings.material_multiplier}×</div>
              <div><span className="text-muted-foreground">Timepris:</span> kr {settings.default_hour_rate}</div>
            </div>
          </div>
        </TabsContent>

        {/* ===== Attachments Tab ===== */}
        <TabsContent value="attachments" className="space-y-4 pt-4">
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
                <Upload className="h-3.5 w-3.5" /> Velg filer
              </Button>
              {files.length > 0 && (
                <Button size="sm" onClick={handleUpload} disabled={uploading} className="gap-1.5">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Last opp ({files.length})
                </Button>
              )}
              <span className="text-xs text-muted-foreground">Bilder, PDF, tegninger, Excel, Word</span>
              <input ref={fileInputRef} type="file" multiple className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf"
                onChange={(e) => {
                  const valid = Array.from(e.target.files || []).filter((f) => {
                    if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name} for stor`); return false; }
                    return true;
                  });
                  setFiles((prev) => [...prev, ...valid]);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Klare for opplasting</p>
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md bg-accent px-2.5 py-1.5 text-sm">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}

          {attachments.length > 0 ? (
            <div className="space-y-1.5">
              {attachments.map((att: any, i: number) => (
                <div key={i} className="flex items-center gap-2 rounded-md bg-secondary px-2.5 py-1.5 text-sm">
                  {/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(att.name) ? <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="truncate flex-1 hover:underline">{att.name}</a>
                  {isAdmin && (
                    <button onClick={() => removeAttachment(att.url)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              ))}
            </div>
          ) : files.length === 0 && (
            <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
              <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Ingen vedlegg</p>
            </div>
          )}
        </TabsContent>

        {/* ===== AI Analysis Tab ===== */}
        <TabsContent value="ai" className="space-y-4 pt-4">
          {!analysis ? (
            <div className="rounded-lg border border-dashed bg-card p-8 text-center space-y-3">
              <Sparkles className="h-10 w-10 mx-auto text-muted-foreground" />
              <h3 className="text-lg font-medium">Ingen AI-analyse ennå</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Klikk "AI-analyse" for å la AI analysere arbeidsbeskrivelsen og generere materialliste og timeregnskap.
              </p>
              {isAdmin && (
                <Button onClick={handleAiGenerate} disabled={aiLoading} className="gap-1.5">
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Start AI-analyse
                </Button>
              )}
            </div>
          ) : analysis.status === "insufficient_data" ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-orange-800 dark:text-orange-200">Mer informasjon kreves før AI kan generere realistisk kalkyle</h3>
                    <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">Beskrivelsen mangler kritisk informasjon.</p>
                  </div>
                </div>
                {analysis.missing_information?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-orange-800 dark:text-orange-200 mb-1">Manglende informasjon:</p>
                    <ul className="text-sm space-y-0.5 text-orange-700 dark:text-orange-300">
                      {analysis.missing_information.map((info: string, i: number) => <li key={i} className="flex gap-2"><span>•</span><span>{info}</span></li>)}
                    </ul>
                  </div>
                )}
                {analysis.clarifying_questions?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-orange-800 dark:text-orange-200 mb-1">Oppfølgingsspørsmål:</p>
                    <ul className="text-sm space-y-0.5 text-orange-700 dark:text-orange-300">
                      {analysis.clarifying_questions.map((q: string, i: number) => <li key={i} className="flex gap-2"><span>❓</span><span>{q}</span></li>)}
                    </ul>
                  </div>
                )}
              </div>
              {isAdmin && (
                <Button onClick={handleAiGenerate} disabled={aiLoading} variant="outline" className="gap-1.5">
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Kjør AI-analyse på nytt
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {analysis.confidence_level && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Konfidens:</span>
                  <Badge className={confidenceColor(analysis.confidence_level)}>
                    {analysis.confidence_level === "high" ? "Høy" : analysis.confidence_level === "medium" ? "Middels" : "Lav"}
                  </Badge>
                  {analysis.requires_manual_review && <Badge variant="outline" className="text-xs">Krever manuell gjennomgang</Badge>}
                </div>
              )}
              <div className="rounded-lg border bg-card p-4 space-y-2">
                <h3 className="text-sm font-medium">Oppsummering</h3>
                <p className="text-sm text-muted-foreground">{analysis.job_summary}</p>
                {analysis.job_type && <Badge variant="outline">{analysis.job_type}</Badge>}
              </div>
              {analysis.assumptions?.length > 0 && (
                <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-4 space-y-2">
                  <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">📋 Forutsetninger</h3>
                  <ul className="text-sm space-y-0.5 text-blue-700 dark:text-blue-300">
                    {analysis.assumptions.map((a: string, i: number) => <li key={i} className="flex gap-2"><span>•</span><span>{a}</span></li>)}
                  </ul>
                </div>
              )}
              {analysis.risk_notes?.length > 0 && (
                <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 p-4 space-y-2">
                  <h3 className="text-sm font-medium text-orange-800 dark:text-orange-200">⚠ Risikovurdering</h3>
                  <ul className="text-sm space-y-0.5 text-orange-700 dark:text-orange-300">
                    {analysis.risk_notes.map((note: string, i: number) => <li key={i} className="flex gap-2"><span>•</span><span>{note}</span></li>)}
                  </ul>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {analysis.estimated_duration_days && (
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Estimert varighet</p>
                    <p className="text-lg font-bold">{analysis.estimated_duration_days} dager</p>
                  </div>
                )}
                {analysis.recommended_technicians && (
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Anbefalt montører</p>
                    <p className="text-lg font-bold">{analysis.recommended_technicians} stk</p>
                  </div>
                )}
              </div>
              {isAdmin && (
                <Button onClick={handleAiGenerate} disabled={aiLoading} variant="outline" size="sm" className="gap-1.5">
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Kjør på nytt
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        {/* ===== Calculation Lines Tab ===== */}
        <TabsContent value="items" className="space-y-6 pt-4">
          {isAdmin && items.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Switch checked={showCost} onCheckedChange={setShowCost} id="cost-toggle" />
                <label htmlFor="cost-toggle" className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer">
                  {showCost ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {showCost ? "Vis kost & margin" : "Skjul kost & margin"}
                </label>
              </div>
            </div>
          )}

          {/* Materials */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Materialer</h3>
              {isAdmin && <Button variant="outline" size="sm" onClick={() => addItem("material")} className="gap-1"><Plus className="h-3 w-3" /> Legg til</Button>}
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Beskrivelse</TableHead>
                    <TableHead className="w-[80px]">Antall</TableHead>
                    <TableHead className="w-[70px]">Enhet</TableHead>
                    {showCost && <TableHead className="w-[90px]">Kost</TableHead>}
                    <TableHead className="w-[100px]">Salgspris</TableHead>
                    <TableHead className="w-[100px] text-right">Sum</TableHead>
                    {showCost && <TableHead className="w-[90px] text-right">Margin</TableHead>}
                    {isAdmin && <TableHead className="w-[50px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.length === 0 ? (
                    <TableRow><TableCell colSpan={showCost ? 8 : 6} className="text-center text-muted-foreground py-4">Ingen materialer</TableCell></TableRow>
                  ) : materials.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {isAdmin ? <Input value={item.title} onChange={(e) => handleItemChange(item.id, "title", e.target.value)} className="h-8 text-sm" /> : <span className="text-sm">{item.title}</span>}
                        {item.suggested_by_ai && <Badge variant="outline" className="ml-1.5 text-[10px]">AI</Badge>}
                      </TableCell>
                      <TableCell>
                        {isAdmin ? <Input type="number" value={item.quantity} onChange={(e) => handleItemChange(item.id, "quantity", Number(e.target.value))} className="h-8 text-sm w-20" /> : item.quantity}
                      </TableCell>
                      <TableCell className="text-sm">{item.unit}</TableCell>
                      {showCost && <TableCell className="text-sm font-mono text-muted-foreground">kr {getCostPrice(item).toLocaleString("nb-NO", { maximumFractionDigits: 0 })}</TableCell>}
                      <TableCell>
                        {isAdmin ? <Input type="number" value={item.unit_price} onChange={(e) => handleItemChange(item.id, "unit_price", Number(e.target.value))} className="h-8 text-sm w-24" /> : `kr ${item.unit_price}`}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">kr {item.total_price.toLocaleString("nb-NO")}</TableCell>
                      {showCost && <TableCell className="text-right font-mono text-sm text-primary">kr {getMargin(item).toLocaleString("nb-NO", { maximumFractionDigits: 0 })}</TableCell>}
                      {isAdmin && <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteItem(item.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Labor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Arbeid</h3>
              {isAdmin && <Button variant="outline" size="sm" onClick={() => addItem("labor")} className="gap-1"><Plus className="h-3 w-3" /> Legg til</Button>}
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Beskrivelse</TableHead>
                    <TableHead className="w-[80px]">Timer</TableHead>
                    <TableHead className="w-[100px]">Timepris</TableHead>
                    <TableHead className="w-[100px] text-right">Sum</TableHead>
                    {isAdmin && <TableHead className="w-[50px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {labor.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">Ingen arbeidsposter</TableCell></TableRow>
                  ) : labor.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {isAdmin ? <Input value={item.title} onChange={(e) => handleItemChange(item.id, "title", e.target.value)} className="h-8 text-sm" /> : <span className="text-sm">{item.title}</span>}
                        {item.suggested_by_ai && <Badge variant="outline" className="ml-1.5 text-[10px]">AI</Badge>}
                      </TableCell>
                      <TableCell>
                        {isAdmin ? <Input type="number" value={item.quantity} onChange={(e) => handleItemChange(item.id, "quantity", Number(e.target.value))} className="h-8 text-sm w-20" /> : item.quantity}
                      </TableCell>
                      <TableCell>
                        {isAdmin ? <Input type="number" value={item.unit_price} onChange={(e) => handleItemChange(item.id, "unit_price", Number(e.target.value))} className="h-8 text-sm w-24" /> : `kr ${item.unit_price}`}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">kr {item.total_price.toLocaleString("nb-NO")}</TableCell>
                      {isAdmin && <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteItem(item.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ===== Offers Tab ===== */}
        <TabsContent value="offers" className="space-y-4 pt-4">
          {offers.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card p-8 text-center space-y-3">
              <ReceiptText className="h-10 w-10 mx-auto text-muted-foreground" />
              <h3 className="text-lg font-medium">Ingen tilbud generert</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Klikk "Generer tilbud" for å opprette et formelt tilbudsdokument basert på kalkylen.
              </p>
              {isAdmin && (
                <Button onClick={handleGenerateOffer} disabled={pdfLoading || items.length === 0} className="gap-1.5">
                  {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  Generer tilbud
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tilbudsnr</TableHead>
                    <TableHead>Versjon</TableHead>
                    <TableHead>Dato</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Eks. MVA</TableHead>
                    <TableHead className="text-right">Inkl. MVA</TableHead>
                    <TableHead>Handling</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offers.map((offer) => (
                    <TableRow key={offer.id}>
                      <TableCell className="font-mono text-sm font-medium">{offer.offer_number}</TableCell>
                      <TableCell className="text-sm">v{offer.version}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(offer.created_at), "d. MMM yyyy HH:mm", { locale: nb })}</TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Select value={offer.status} onValueChange={(v) => handleOfferStatusChange(offer.id, v as OfferStatus)}>
                            <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ALL_OFFER_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>{OFFER_STATUS_CONFIG[s].label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={OFFER_STATUS_CONFIG[offer.status]?.className}>{OFFER_STATUS_CONFIG[offer.status]?.label}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">kr {Number(offer.total_ex_vat).toLocaleString("nb-NO")}</TableCell>
                      <TableCell className="text-right font-mono text-sm">kr {Number(offer.total_inc_vat).toLocaleString("nb-NO")}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {offer.generated_pdf_url && (
                            <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => window.open(offer.generated_pdf_url!, "_blank")}>
                              <ExternalLink className="h-3 w-3" /> Åpne
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Sticky save bar */}
      {isAdmin && items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-t p-3 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {lastSaved ? `Sist lagret kl ${format(lastSaved, "HH:mm:ss")}` : "Ikke lagret ennå"} • Auto-lagring aktiv
          </div>
          <Button onClick={() => saveItems()} className="gap-1.5">
            <Save className="h-4 w-4" /> Lagre endringer
          </Button>
        </div>
      )}

      {/* Convert dialog */}
      <ConvertToJobDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        calculationId={calc.id}
        offerId={latestAcceptedOffer?.id}
        defaultTitle={calc.project_title}
        defaultCustomer={calc.customer_name}
        defaultDescription={calc.description || undefined}
      />
    </div>
  );
}
