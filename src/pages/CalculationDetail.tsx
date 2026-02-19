import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  ArrowLeft, Loader2, Sparkles, FileDown, ArrowRightLeft, Plus, Trash2, Save,
  Building2, Mail, FileText, Brain, Package,
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

export default function CalculationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const [calc, setCalc] = useState<Calculation | null>(null);
  const [items, setItems] = useState<CalcItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [convertLoading, setConvertLoading] = useState(false);
  const [settings, setSettings] = useState({ material_multiplier: 2.0, default_hour_rate: 1080 });

  const fetchCalc = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [calcRes, itemsRes, settingsRes] = await Promise.all([
      supabase.from("calculations").select("*").eq("id", id).single(),
      supabase.from("calculation_items").select("*").eq("calculation_id", id).order("type").order("title"),
      supabase.from("settings").select("key, value"),
    ]);
    if (calcRes.data) setCalc(calcRes.data as unknown as Calculation);
    if (itemsRes.data) setItems(itemsRes.data as CalcItem[]);
    if (settingsRes.data) {
      const s: any = { material_multiplier: 2.0, default_hour_rate: 1080 };
      settingsRes.data.forEach((row: any) => {
        if (row.key === "material_multiplier") s.material_multiplier = Number(row.value);
        if (row.key === "default_hour_rate") s.default_hour_rate = Number(row.value);
      });
      setSettings(s);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchCalc(); }, [fetchCalc]);

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

      // Save AI analysis
      await supabase.from("calculations").update({ ai_analysis: data }).eq("id", calc.id);

      // Delete existing AI-suggested items
      await supabase.from("calculation_items").delete().eq("calculation_id", calc.id).eq("suggested_by_ai", true);

      // Insert new items from AI
      const newItems: any[] = [];
      if (data.materials) {
        for (const m of data.materials) {
          const sellPrice = (m.unit_price || 0) * settings.material_multiplier;
          newItems.push({
            calculation_id: calc.id,
            type: "material",
            title: m.title,
            description: m.description || null,
            quantity: m.quantity || 1,
            unit: m.unit || "stk",
            unit_price: sellPrice,
            total_price: sellPrice * (m.quantity || 1),
            suggested_by_ai: true,
          });
        }
      }
      if (data.labor) {
        for (const l of data.labor) {
          newItems.push({
            calculation_id: calc.id,
            type: "labor",
            title: l.title,
            description: l.description || null,
            quantity: l.hours || 1,
            unit: "timer",
            unit_price: settings.default_hour_rate,
            total_price: (l.hours || 1) * settings.default_hour_rate,
            suggested_by_ai: true,
          });
        }
      }

      if (newItems.length > 0) {
        await supabase.from("calculation_items").insert(newItems);
      }

      // Recalculate totals
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

  const handleItemChange = async (itemId: string, field: string, value: any) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    const updated = { ...item, [field]: value };
    if (field === "quantity" || field === "unit_price") {
      updated.total_price = Number(updated.quantity) * Number(updated.unit_price);
    }

    setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
  };

  const saveItems = async () => {
    if (!calc) return;
    for (const item of items) {
      await supabase.from("calculation_items").update({
        title: item.title,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total_price: item.total_price,
      }).eq("id", item.id);
    }
    const totals = recalcTotals(items);
    await supabase.from("calculations").update(totals).eq("id", calc.id);
    setCalc((prev) => prev ? { ...prev, ...totals } : null);
    toast.success("Kalkulasjon lagret");
  };

  const addItem = async (type: "material" | "labor") => {
    if (!calc) return;
    const { data, error } = await supabase.from("calculation_items").insert({
      calculation_id: calc.id,
      type,
      title: type === "material" ? "Nytt materiale" : "Ny arbeidspost",
      quantity: 1,
      unit: type === "material" ? "stk" : "timer",
      unit_price: type === "labor" ? settings.default_hour_rate : 0,
      total_price: type === "labor" ? settings.default_hour_rate : 0,
      suggested_by_ai: false,
    }).select().single();

    if (data) {
      setItems((prev) => [...prev, data as CalcItem]);
      toast.success("Post lagt til");
    }
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
        body: { calculation_id: calc.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Open HTML in new window for printing/PDF
      const blob = new Blob([data.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setCalc((prev) => prev ? { ...prev, status: "generated" as CalculationStatus } : null);
      toast.success("Tilbud generert – skriv ut som PDF fra nettleseren");
    } catch (err: any) {
      toast.error("Kunne ikke generere tilbud", { description: err.message });
    }
    setPdfLoading(false);
  };

  const handleConvertToProject = async () => {
    if (!calc) return;
    setConvertLoading(true);
    try {
      // Get first available technician
      const { data: techs } = await supabase.from("technicians").select("id").limit(1);
      const techId = techs?.[0]?.id;
      if (!techId) {
        toast.error("Ingen montører tilgjengelig");
        setConvertLoading(false);
        return;
      }

      const now = new Date();
      const { data: event, error } = await supabase.from("events").insert({
        title: calc.project_title,
        customer: calc.customer_name,
        description: calc.description || `Konvertert fra kalkulasjon`,
        start_time: now.toISOString(),
        end_time: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(),
        status: "requested",
        technician_id: techId,
        created_by: user?.id,
      }).select("id").single();

      if (error) throw error;

      await supabase.from("event_technicians").insert({
        event_id: event.id,
        technician_id: techId,
      });

      await supabase.from("calculations").update({ status: "converted" }).eq("id", calc.id);

      toast.success("Konvertert til prosjekt");
      navigate(`/jobs/${event.id}`);
    } catch (err: any) {
      toast.error("Kunne ikke konvertere", { description: err.message });
    }
    setConvertLoading(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!calc) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">Kalkulasjon ikke funnet</p>
          <Button variant="outline" onClick={() => navigate("/calculations")}>Tilbake</Button>
        </div>
      </div>
    );
  }

  const materials = items.filter((i) => i.type === "material");
  const labor = items.filter((i) => i.type === "labor");
  const analysis = calc.ai_analysis;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/calculations")} className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Tilbake
        </Button>
        <div className="flex gap-2">
          {isAdmin && calc.status !== "converted" && (
            <Select value={calc.status} onValueChange={(v) => handleStatusChange(v as CalculationStatus)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
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
              {calc.customer_email && (
                <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{calc.customer_email}</span>
              )}
            </div>
          </div>
          <Badge className={CALCULATION_STATUS_CONFIG[calc.status]?.className + " text-sm"}>
            {CALCULATION_STATUS_CONFIG[calc.status]?.label}
          </Badge>
        </div>

        {/* Action buttons */}
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleAiGenerate} disabled={aiLoading} variant="outline" className="gap-1.5">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              AI-analyse
            </Button>
            <Button onClick={saveItems} variant="outline" className="gap-1.5">
              <Save className="h-4 w-4" />
              Lagre
            </Button>
            <Button onClick={handleGenerateOffer} disabled={pdfLoading || items.length === 0} variant="outline" className="gap-1.5">
              {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Generer tilbud
            </Button>
            {calc.status === "accepted" && (
              <Button onClick={handleConvertToProject} disabled={convertLoading} className="gap-1.5">
                {convertLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                Konverter til prosjekt
              </Button>
            )}
          </div>
        )}

        {/* Summary cards */}
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
      </header>

      <Tabs defaultValue="overview">
        <TabsList className="w-full sm:w-auto flex overflow-x-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Oversikt
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Brain className="h-3.5 w-3.5" />
            AI Analyse
          </TabsTrigger>
          <TabsTrigger value="items" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Kalkylelinjer ({items.length})
          </TabsTrigger>
        </TabsList>

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
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border bg-card p-4 space-y-2">
                <h3 className="text-sm font-medium">Oppsummering</h3>
                <p className="text-sm text-muted-foreground">{analysis.job_summary}</p>
                {analysis.job_type && (
                  <Badge variant="outline">{analysis.job_type}</Badge>
                )}
              </div>
              {analysis.risk_notes?.length > 0 && (
                <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 p-4 space-y-2">
                  <h3 className="text-sm font-medium text-orange-800 dark:text-orange-200">⚠ Risikovurdering</h3>
                  <ul className="text-sm space-y-1 text-orange-700 dark:text-orange-300">
                    {analysis.risk_notes.map((note: string, i: number) => (
                      <li key={i} className="flex gap-2"><span>•</span><span>{note}</span></li>
                    ))}
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
            </div>
          )}
        </TabsContent>

        <TabsContent value="items" className="space-y-6 pt-4">
          {/* Materials */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Materialer</h3>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => addItem("material")} className="gap-1">
                  <Plus className="h-3 w-3" /> Legg til
                </Button>
              )}
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Beskrivelse</TableHead>
                    <TableHead className="w-[80px]">Antall</TableHead>
                    <TableHead className="w-[70px]">Enhet</TableHead>
                    <TableHead className="w-[100px]">Pris</TableHead>
                    <TableHead className="w-[100px] text-right">Sum</TableHead>
                    {isAdmin && <TableHead className="w-[50px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">Ingen materialer</TableCell></TableRow>
                  ) : materials.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {isAdmin ? (
                          <Input value={item.title} onChange={(e) => handleItemChange(item.id, "title", e.target.value)} className="h-8 text-sm" />
                        ) : (
                          <span className="text-sm">{item.title}</span>
                        )}
                        {item.suggested_by_ai && <Badge variant="outline" className="ml-1.5 text-[10px]">AI</Badge>}
                      </TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Input type="number" value={item.quantity} onChange={(e) => handleItemChange(item.id, "quantity", Number(e.target.value))} className="h-8 text-sm w-20" />
                        ) : item.quantity}
                      </TableCell>
                      <TableCell className="text-sm">{item.unit}</TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Input type="number" value={item.unit_price} onChange={(e) => handleItemChange(item.id, "unit_price", Number(e.target.value))} className="h-8 text-sm w-24" />
                        ) : `kr ${item.unit_price}`}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">kr {item.total_price.toLocaleString("nb-NO")}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteItem(item.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
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
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => addItem("labor")} className="gap-1">
                  <Plus className="h-3 w-3" /> Legg til
                </Button>
              )}
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
                        {isAdmin ? (
                          <Input value={item.title} onChange={(e) => handleItemChange(item.id, "title", e.target.value)} className="h-8 text-sm" />
                        ) : (
                          <span className="text-sm">{item.title}</span>
                        )}
                        {item.suggested_by_ai && <Badge variant="outline" className="ml-1.5 text-[10px]">AI</Badge>}
                      </TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Input type="number" value={item.quantity} onChange={(e) => handleItemChange(item.id, "quantity", Number(e.target.value))} className="h-8 text-sm w-20" />
                        ) : item.quantity}
                      </TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Input type="number" value={item.unit_price} onChange={(e) => handleItemChange(item.id, "unit_price", Number(e.target.value))} className="h-8 text-sm w-24" />
                        ) : `kr ${item.unit_price}`}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">kr {item.total_price.toLocaleString("nb-NO")}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteItem(item.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {isAdmin && items.length > 0 && (
            <div className="flex justify-end">
              <Button onClick={saveItems} className="gap-1.5">
                <Save className="h-4 w-4" />
                Lagre endringer
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
