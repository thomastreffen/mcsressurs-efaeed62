import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Upload, Loader2, Sparkles, CheckCircle2, AlertTriangle,
  FileSpreadsheet, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";

type FieldMapping = {
  column: string;
  field: string;
};

const TARGET_FIELDS = [
  { value: "skip", label: "— Hopp over —" },
  { value: "name", label: "Kundenavn" },
  { value: "org_number", label: "Org.nr" },
  { value: "main_email", label: "E-post" },
  { value: "main_phone", label: "Telefon" },
  { value: "billing_address", label: "Adresse" },
  { value: "billing_zip", label: "Postnr" },
  { value: "billing_city", label: "By" },
  { value: "notes", label: "Notater" },
];

// Simple AI-like heuristic for column mapping
function suggestMapping(header: string): string {
  const h = header.toLowerCase().trim();
  if (/^(kunde|firm|company|name|navn)/.test(h)) return "name";
  if (/org|org\.?\s?n|organi/.test(h)) return "org_number";
  if (/e-?post|email|mail/.test(h)) return "main_email";
  if (/tele|phone|mobil|tlf/.test(h)) return "main_phone";
  if (/adress|address|gate/.test(h)) return "billing_address";
  if (/post\s?n|zip|postn/.test(h)) return "billing_zip";
  if (/by|city|sted/.test(h)) return "billing_city";
  if (/notat|note|komment/.test(h)) return "notes";
  return "skip";
}

export default function CustomerImportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCompanyId } = useCompanyContext();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [importing, setImporting] = useState(false);
  const [aiMapping, setAiMapping] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; duplicates: string[] } | null>(null);

  const parseCSV = (text: string): { headers: string[]; rows: string[][] } => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    const delimiter = lines[0].includes(";") ? ";" : ",";
    const hdrs = lines[0].split(delimiter).map((h) => h.replace(/"/g, "").trim());
    const dataRows = lines.slice(1).map((line) =>
      line.split(delimiter).map((cell) => cell.replace(/"/g, "").trim())
    );
    return { headers: hdrs, rows: dataRows };
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
      const text = await file.text();
      const { headers: h, rows: r } = parseCSV(text);
      setHeaders(h);
      setRows(r);
    } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      toast.error("XLSX-støtte kommer snart. Bruk CSV for nå.");
      return;
    } else {
      toast.error("Ugyldig filformat. Bruk CSV.");
      return;
    }

    // Auto-suggest mappings
    setAiMapping(true);
    await new Promise((r) => setTimeout(r, 600)); // Simulate AI thinking
    // Use headers from the parsed data
    e.target.value = "";
  }, []);

  // When headers change, create mappings
  const handleAutoMap = useCallback(() => {
    if (headers.length === 0) return;
    const suggested = headers.map((h) => ({ column: h, field: suggestMapping(h) }));
    setMappings(suggested);
    setAiMapping(false);
    setStep(2);
  }, [headers]);

  // Trigger auto-map when headers are set
  useState(() => {
    if (headers.length > 0 && mappings.length === 0) {
      handleAutoMap();
    }
  });

  const updateMapping = (index: number, field: string) => {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, field } : m)));
  };

  const previewRows = rows.slice(0, 10);

  const getMappedValue = (row: string[], field: string): string | null => {
    const idx = mappings.findIndex((m) => m.field === field);
    if (idx < 0 || idx >= row.length) return null;
    return row[idx] || null;
  };

  const handleImport = async () => {
    if (!mappings.some((m) => m.field === "name")) {
      toast.error("Du må mappe minst 'Kundenavn'");
      return;
    }

    setImporting(true);
    let created = 0;
    let skipped = 0;
    const duplicates: string[] = [];

    // Fetch existing customers for duplicate detection
    const { data: existing } = await supabase
      .from("customers")
      .select("id, name, org_number, main_email");

    const existingMap = new Map<string, string>();
    if (existing) {
      for (const c of existing as any[]) {
        if (c.org_number) existingMap.set(c.org_number.replace(/\s/g, ""), c.name);
        existingMap.set(c.name.toLowerCase(), c.org_number || c.main_email || "");
      }
    }

    for (const row of rows) {
      const name = getMappedValue(row, "name");
      if (!name || !name.trim()) { skipped++; continue; }

      const orgNum = getMappedValue(row, "org_number")?.replace(/\s/g, "") || null;

      // Duplicate check
      if (orgNum && existingMap.has(orgNum)) {
        duplicates.push(`${name} (org: ${orgNum})`);
        skipped++;
        continue;
      }
      if (existingMap.has(name.toLowerCase())) {
        duplicates.push(`${name}`);
        skipped++;
        continue;
      }

      const { error } = await supabase.from("customers").insert({
        name: name.trim(),
        org_number: orgNum,
        main_email: getMappedValue(row, "main_email"),
        main_phone: getMappedValue(row, "main_phone"),
        billing_address: getMappedValue(row, "billing_address"),
        billing_zip: getMappedValue(row, "billing_zip"),
        billing_city: getMappedValue(row, "billing_city"),
        notes: getMappedValue(row, "notes"),
        company_id: activeCompanyId || null,
        created_by: user?.id || null,
      } as any);

      if (error) {
        console.error("Import error for", name, error);
        skipped++;
      } else {
        created++;
      }
    }

    setImportResult({ created, skipped, duplicates });
    setStep(4);
    setImporting(false);
    toast.success(`${created} kunder importert`);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/customers")} className="rounded-xl h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importer kunder
          </h1>
          <p className="text-sm text-muted-foreground">Last opp CSV med kundedata</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {step > s ? <CheckCircle2 className="h-3.5 w-3.5" /> : s}
            </div>
            <span className={step >= s ? "text-foreground font-medium" : "text-muted-foreground"}>
              {s === 1 ? "Last opp" : s === 2 ? "Mapping" : s === 3 ? "Forhåndsvisning" : "Ferdig"}
            </span>
            {s < 4 && <ArrowRight className="h-3 w-3 text-muted-foreground mx-1" />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card className="rounded-2xl">
          <CardContent className="py-12 flex flex-col items-center text-center space-y-4">
            <div className="rounded-2xl bg-primary/5 p-6">
              <Upload className="h-12 w-12 text-primary/40" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Last opp kundefil</h2>
              <p className="text-sm text-muted-foreground mt-1">Støtter CSV-filer med kolonnehoder</p>
            </div>
            <label className="cursor-pointer">
              <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => {
                handleFileUpload(e).then(() => {
                  if (headers.length > 0) handleAutoMap();
                });
              }} />
              <div className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
                <Upload className="h-4 w-4" />
                Velg fil
              </div>
            </label>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Mapping */}
      {step === 2 && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI-foreslått kolonne-mapping
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Vi har forsøkt å matche kolonnene automatisk. Juster ved behov.</p>
            <div className="space-y-3">
              {mappings.map((m, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Kolonne fra fil</Label>
                    <p className="text-sm font-medium font-mono bg-muted/50 rounded px-2 py-1">{m.column}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Felt i systemet</Label>
                    <Select value={m.field} onValueChange={(v) => updateMapping(i, v)}>
                      <SelectTrigger className="rounded-lg h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TARGET_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(1)} className="rounded-xl">Tilbake</Button>
              <Button onClick={() => setStep(3)} className="rounded-xl gap-1.5">
                Forhåndsvisning <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Preview */}
      {step === 3 && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Forhåndsvisning ({Math.min(10, rows.length)} av {rows.length} rader)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {mappings.filter((m) => m.field !== "skip").map((m, i) => (
                      <TableHead key={i} className="text-xs">{TARGET_FIELDS.find((f) => f.value === m.field)?.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, ri) => (
                    <TableRow key={ri}>
                      {mappings.filter((m) => m.field !== "skip").map((m, ci) => {
                        const origIdx = mappings.indexOf(m);
                        return <TableCell key={ci} className="text-sm">{row[origIdx] || "—"}</TableCell>;
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between items-center pt-2">
              <p className="text-sm text-muted-foreground">{rows.length} rader vil bli importert</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)} className="rounded-xl">Tilbake</Button>
                <Button onClick={handleImport} disabled={importing} className="rounded-xl gap-1.5">
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {importing ? "Importerer..." : "Start import"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Result */}
      {step === 4 && importResult && (
        <Card className="rounded-2xl">
          <CardContent className="py-12 flex flex-col items-center text-center space-y-4">
            <div className="rounded-2xl bg-green-500/10 p-6">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Import fullført</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {importResult.created} kunder opprettet, {importResult.skipped} hoppet over
              </p>
            </div>
            {importResult.duplicates.length > 0 && (
              <div className="text-left w-full max-w-md rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-3 space-y-1">
                <p className="text-sm font-medium flex items-center gap-1.5 text-orange-700 dark:text-orange-300">
                  <AlertTriangle className="h-4 w-4" /> Duplikater funnet ({importResult.duplicates.length})
                </p>
                {importResult.duplicates.slice(0, 5).map((d, i) => (
                  <p key={i} className="text-xs text-muted-foreground">{d}</p>
                ))}
                {importResult.duplicates.length > 5 && (
                  <p className="text-xs text-muted-foreground">... og {importResult.duplicates.length - 5} flere</p>
                )}
              </div>
            )}
            <Button onClick={() => navigate("/customers")} className="rounded-xl gap-1.5">
              Gå til kundelisten
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
