import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, ArrowRight, Check, Loader2, Plus, Trash2, FileDown,
  Building2, Package, Eye, FileText,
} from "lucide-react";
import { toast } from "sonner";

interface LineItem {
  id: string;
  type: "material" | "labor";
  title: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
}

const STEPS = [
  { label: "Kunde & prosjekt", icon: Building2 },
  { label: "Kalkylelinjer", icon: Package },
  { label: "Forhåndsvisning", icon: Eye },
  { label: "Generer tilbud", icon: FileDown },
];

export default function NewOfferWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Step 1: Customer/Project
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [description, setDescription] = useState("");
  const [calcId, setCalcId] = useState<string | null>(null);

  // Step 2: Line items
  const [items, setItems] = useState<LineItem[]>([]);
  const [settings, setSettings] = useState({ material_multiplier: 2.0, default_hour_rate: 1080 });

  // Step 4: Result
  const [result, setResult] = useState<any>(null);

  // Existing calculation selection
  const [existingCalcs, setExistingCalcs] = useState<any[]>([]);
  const [useExisting, setUseExisting] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("settings").select("key, value"),
      supabase.from("calculations").select("id, customer_name, project_title, total_price, status")
        .is("deleted_at", null)
        .in("status", ["draft", "generated"])
        .order("created_at", { ascending: false })
        .limit(20),
    ]).then(([settingsRes, calcsRes]) => {
      if (settingsRes.data) {
        const s: any = { material_multiplier: 2.0, default_hour_rate: 1080 };
        settingsRes.data.forEach((row: any) => {
          if (row.key === "material_multiplier") s.material_multiplier = Number(row.value);
          if (row.key === "default_hour_rate") s.default_hour_rate = Number(row.value);
        });
        setSettings(s);
      }
      if (calcsRes.data) setExistingCalcs(calcsRes.data);
    });
  }, []);

  const progress = ((step + 1) / STEPS.length) * 100;

  const totals = {
    material: items.filter(i => i.type === "material").reduce((s, i) => s + i.total_price, 0),
    labor: items.filter(i => i.type === "labor").reduce((s, i) => s + i.total_price, 0),
    get total() { return this.material + this.labor; },
    get vat() { return this.total * 0.25; },
    get totalIncVat() { return this.total * 1.25; },
  };

  const formatPrice = (n: number) => n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const selectExistingCalc = async (id: string) => {
    const [calcRes, itemsRes] = await Promise.all([
      supabase.from("calculations").select("*").eq("id", id).single(),
      supabase.from("calculation_items").select("*").eq("calculation_id", id).order("type").order("title"),
    ]);
    if (calcRes.data) {
      setCalcId(id);
      setCustomerName(calcRes.data.customer_name);
      setCustomerEmail(calcRes.data.customer_email || "");
      setProjectTitle(calcRes.data.project_title);
      setDescription(calcRes.data.description || "");
    }
    if (itemsRes.data) {
      setItems(itemsRes.data.map((i: any) => ({
        id: i.id, type: i.type, title: i.title, description: i.description || "",
        quantity: i.quantity, unit: i.unit || "stk", unit_price: i.unit_price, total_price: i.total_price,
      })));
    }
    setUseExisting(false);
    setStep(1);
    toast.success("Kalkulasjon lastet");
  };

  const ensureCalc = useCallback(async () => {
    if (calcId) return calcId;
    if (!customerName.trim() || !projectTitle.trim()) {
      toast.error("Kundenavn og prosjekttittel er påkrevd");
      return null;
    }
    setSaving(true);
    const { data, error } = await supabase.from("calculations").insert({
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim() || null,
      project_title: projectTitle.trim(),
      description: description.trim() || null,
      created_by: user!.id,
    }).select("id").single();
    setSaving(false);
    if (error) { toast.error("Feil", { description: error.message }); return null; }
    setCalcId(data.id);
    return data.id;
  }, [calcId, customerName, customerEmail, projectTitle, description, user]);

  const saveItems = async (cId: string) => {
    // Delete old AI items, insert all current
    await supabase.from("calculation_items").delete().eq("calculation_id", cId);
    if (items.length > 0) {
      await supabase.from("calculation_items").insert(
        items.map(i => ({
          calculation_id: cId, type: i.type, title: i.title, description: i.description || null,
          quantity: i.quantity, unit: i.unit, unit_price: i.unit_price, total_price: i.total_price,
          suggested_by_ai: false,
        }))
      );
    }
    await supabase.from("calculations").update({
      total_material: totals.material, total_labor: totals.labor, total_price: totals.total,
      description: description.trim() || null,
    }).eq("id", cId);
  };

  const handleNext = async () => {
    if (step === 0) {
      if (!customerName.trim() || !projectTitle.trim()) {
        toast.error("Kundenavn og prosjekttittel er påkrevd");
        return;
      }
    }
    if (step === 1) {
      const cId = await ensureCalc();
      if (!cId) return;
      await saveItems(cId);
    }
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const addItem = (type: "material" | "labor") => {
    const rate = type === "labor" ? settings.default_hour_rate : 0;
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      type, title: type === "material" ? "Nytt materiale" : "Ny arbeidspost",
      description: "", quantity: 1, unit: type === "material" ? "stk" : "timer",
      unit_price: rate, total_price: rate,
    }]);
  };

  const updateItem = (id: string, field: string, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === "quantity" || field === "unit_price") {
        updated.total_price = Number(updated.quantity) * Number(updated.unit_price);
      }
      return updated;
    }));
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const handleGenerate = async () => {
    if (!calcId) return;
    setGenerating(true);
    try {
      await saveItems(calcId);
      const { data, error } = await supabase.functions.invoke("generate-offer-pdf", {
        body: { calculation_id: calcId, created_by: user?.id },
      });
      if (error) {
        if (error.message?.includes("Ingen endringer")) {
          toast.info("Ingen endringer", { description: error.message });
          setGenerating(false);
          return;
        }
        throw error;
      }
      if (data?.error) {
        if (data.error.includes("Ingen endringer")) {
          toast.info("Ingen endringer", { description: data.error });
          setGenerating(false);
          return;
        }
        throw new Error(data.error);
      }
      setResult(data);
      toast.success(`Tilbud v${data.version} generert!`);
    } catch (err: any) {
      toast.error("Feil", { description: err.message });
    }
    setGenerating(false);
  };

  const materials = items.filter(i => i.type === "material");
  const labor = items.filter(i => i.type === "labor");

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/sales/offers")} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Tilbake
      </Button>

      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Nytt tilbud</h1>
        <p className="text-sm text-muted-foreground mt-1">Steg {step + 1} av {STEPS.length} — {STEPS[step].label}</p>
      </div>

      <div className="space-y-2">
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between">
          {STEPS.map((s, i) => (
            <button key={i} onClick={() => { if (i <= step) setStep(i); }}
              className={`flex items-center gap-1 text-xs transition-colors ${i <= step ? "text-primary font-medium" : "text-muted-foreground"} ${i <= step ? "cursor-pointer" : "cursor-default"}`}>
              {i < step ? <Check className="h-3 w-3" /> : <s.icon className="h-3 w-3" />}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 min-h-[350px]">
        {/* ── Step 0: Customer & Project ── */}
        {step === 0 && (
          <div className="space-y-6">
            {existingCalcs.length > 0 && !useExisting && (
              <div className="rounded-lg border border-dashed p-4 space-y-2">
                <p className="text-sm font-medium">Bruk eksisterende kalkulasjon?</p>
                <p className="text-xs text-muted-foreground">Velg en kalkulasjon som grunnlag, eller fyll ut manuelt under.</p>
                <div className="flex flex-wrap gap-2">
                  {existingCalcs.slice(0, 5).map(c => (
                    <Button key={c.id} variant="outline" size="sm" onClick={() => selectExistingCalc(c.id)} className="text-xs">
                      {c.customer_name} — {c.project_title}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Kundenavn *</Label>
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Firma eller person" />
              </div>
              <div className="space-y-1.5">
                <Label>Kunde e-post</Label>
                <Input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="epost@eksempel.no" type="email" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Prosjekttittel *</Label>
              <Input value={projectTitle} onChange={e => setProjectTitle(e.target.value)} placeholder="Beskrivende tittel" />
            </div>
            <div className="space-y-1.5">
              <Label>Beskrivelse</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Arbeidsbeskrivelse (valgfritt)" rows={4} />
            </div>
          </div>
        )}

        {/* ── Step 1: Line Items ── */}
        {step === 1 && (
          <div className="space-y-6">
            {/* Materials */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Materialer</h3>
                <Button variant="outline" size="sm" onClick={() => addItem("material")} className="gap-1"><Plus className="h-3 w-3" /> Legg til</Button>
              </div>
              {materials.length > 0 ? (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Beskrivelse</TableHead>
                        <TableHead className="w-[80px]">Antall</TableHead>
                        <TableHead className="w-[70px]">Enhet</TableHead>
                        <TableHead className="w-[100px]">Pris</TableHead>
                        <TableHead className="w-[100px] text-right">Sum</TableHead>
                        <TableHead className="w-[40px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materials.map(item => (
                        <TableRow key={item.id}>
                          <TableCell><Input value={item.title} onChange={e => updateItem(item.id, "title", e.target.value)} className="h-8 text-sm" /></TableCell>
                          <TableCell><Input type="number" value={item.quantity} onChange={e => updateItem(item.id, "quantity", Number(e.target.value))} className="h-8 text-sm w-20" /></TableCell>
                          <TableCell><Input value={item.unit} onChange={e => updateItem(item.id, "unit", e.target.value)} className="h-8 text-sm w-16" /></TableCell>
                          <TableCell><Input type="number" value={item.unit_price} onChange={e => updateItem(item.id, "unit_price", Number(e.target.value))} className="h-8 text-sm w-24" /></TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">kr {formatPrice(item.total_price)}</TableCell>
                          <TableCell><button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Ingen materialer lagt til</p>
              )}
            </div>

            {/* Labor */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Arbeid</h3>
                <Button variant="outline" size="sm" onClick={() => addItem("labor")} className="gap-1"><Plus className="h-3 w-3" /> Legg til</Button>
              </div>
              {labor.length > 0 ? (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Beskrivelse</TableHead>
                        <TableHead className="w-[80px]">Timer</TableHead>
                        <TableHead className="w-[100px]">Timepris</TableHead>
                        <TableHead className="w-[100px] text-right">Sum</TableHead>
                        <TableHead className="w-[40px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {labor.map(item => (
                        <TableRow key={item.id}>
                          <TableCell><Input value={item.title} onChange={e => updateItem(item.id, "title", e.target.value)} className="h-8 text-sm" /></TableCell>
                          <TableCell><Input type="number" value={item.quantity} onChange={e => updateItem(item.id, "quantity", Number(e.target.value))} className="h-8 text-sm w-20" /></TableCell>
                          <TableCell><Input type="number" value={item.unit_price} onChange={e => updateItem(item.id, "unit_price", Number(e.target.value))} className="h-8 text-sm w-24" /></TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">kr {formatPrice(item.total_price)}</TableCell>
                          <TableCell><button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Ingen arbeidsposter lagt til</p>
              )}
            </div>

            {/* Totals */}
            {items.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="rounded-lg border bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Materialer</p>
                  <p className="text-sm font-bold">kr {formatPrice(totals.material)}</p>
                </div>
                <div className="rounded-lg border bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Arbeid</p>
                  <p className="text-sm font-bold">kr {formatPrice(totals.labor)}</p>
                </div>
                <div className="rounded-lg border bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Eks. MVA</p>
                  <p className="text-sm font-bold text-primary">kr {formatPrice(totals.total)}</p>
                </div>
                <div className="rounded-lg border bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Inkl. MVA</p>
                  <p className="text-sm font-bold">kr {formatPrice(totals.totalIncVat)}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Preview ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{projectTitle}</h3>
                  <p className="text-sm text-muted-foreground">{customerName} {customerEmail && `• ${customerEmail}`}</p>
                </div>
                <Badge variant="outline">Utkast</Badge>
              </div>

              {description && (
                <div className="text-sm text-muted-foreground bg-muted/50 rounded p-3">{description}</div>
              )}

              {materials.length > 0 && (
                <>
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mt-4">Materialer</h4>
                  <div className="rounded border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow><TableHead>Beskrivelse</TableHead><TableHead className="text-right">Antall</TableHead><TableHead className="text-right">Pris</TableHead><TableHead className="text-right">Sum</TableHead></TableRow>
                      </TableHeader>
                      <TableBody>
                        {materials.map(i => (
                          <TableRow key={i.id}>
                            <TableCell className="text-sm">{i.title}</TableCell>
                            <TableCell className="text-right text-sm">{i.quantity} {i.unit}</TableCell>
                            <TableCell className="text-right text-sm font-mono">kr {formatPrice(i.unit_price)}</TableCell>
                            <TableCell className="text-right text-sm font-mono font-medium">kr {formatPrice(i.total_price)}</TableCell>
                          </TableRow>
                        ))
                        }
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {labor.length > 0 && (
                <>
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mt-4">Arbeid</h4>
                  <div className="rounded border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow><TableHead>Beskrivelse</TableHead><TableHead className="text-right">Timer</TableHead><TableHead className="text-right">Timepris</TableHead><TableHead className="text-right">Sum</TableHead></TableRow>
                      </TableHeader>
                      <TableBody>
                        {labor.map(i => (
                          <TableRow key={i.id}>
                            <TableCell className="text-sm">{i.title}</TableCell>
                            <TableCell className="text-right text-sm">{i.quantity}</TableCell>
                            <TableCell className="text-right text-sm font-mono">kr {formatPrice(i.unit_price)}</TableCell>
                            <TableCell className="text-right text-sm font-mono font-medium">kr {formatPrice(i.total_price)}</TableCell>
                          </TableRow>
                        ))
                        }
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              <div className="border-t pt-3 mt-4 space-y-1">
                <div className="flex justify-between text-sm"><span>Materialer</span><span className="font-mono">kr {formatPrice(totals.material)}</span></div>
                <div className="flex justify-between text-sm"><span>Arbeid</span><span className="font-mono">kr {formatPrice(totals.labor)}</span></div>
                <div className="flex justify-between text-sm"><span>MVA (25%)</span><span className="font-mono">kr {formatPrice(totals.vat)}</span></div>
                <div className="flex justify-between text-base font-bold text-primary border-t pt-2 mt-2">
                  <span>Totalt inkl. MVA</span><span className="font-mono">kr {formatPrice(totals.totalIncVat)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Generate ── */}
        {step === 3 && (
          <div className="text-center space-y-6 py-8">
            {!result ? (
              <>
                <FileDown className="h-16 w-16 mx-auto text-primary opacity-60" />
                <div>
                  <h3 className="text-lg font-bold">Klar til å generere tilbud</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                    En profesjonell PDF genereres og lagres automatisk. Tilbudet kan deretter sendes til kunden.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
                  <div className="rounded-lg border p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Eks. MVA</p>
                    <p className="text-sm font-bold">kr {formatPrice(totals.total)}</p>
                  </div>
                  <div className="rounded-lg border p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">MVA</p>
                    <p className="text-sm font-bold">kr {formatPrice(totals.vat)}</p>
                  </div>
                  <div className="rounded-lg border border-primary p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Inkl. MVA</p>
                    <p className="text-sm font-bold text-primary">kr {formatPrice(totals.totalIncVat)}</p>
                  </div>
                </div>
                <Button onClick={handleGenerate} disabled={generating} size="lg" className="gap-2">
                  {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileDown className="h-5 w-5" />}
                  Generer tilbud-PDF
                </Button>
              </>
            ) : (
              <>
                <Check className="h-16 w-16 mx-auto text-green-500" />
                <div>
                  <h3 className="text-lg font-bold">Tilbud generert!</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {result.offer_number && `Tilbudsnr: ${result.offer_number} • `}Versjon {result.version}
                  </p>
                </div>
                <div className="flex justify-center gap-3">
                  {result.pdf_url && (
                    <Button onClick={() => window.open(result.pdf_url, "_blank")} className="gap-1.5">
                      <FileText className="h-4 w-4" /> Åpne PDF
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => navigate(`/sales/calculations/${calcId}`)}>
                    Gå til kalkulasjon
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/sales/offers")}>
                    Tilbudsoversikt
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      {step < 3 && (
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(s => Math.max(s - 1, 0))} disabled={step === 0} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Forrige
          </Button>
          <Button onClick={handleNext} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {step === 2 ? "Gå til generering" : "Neste"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
