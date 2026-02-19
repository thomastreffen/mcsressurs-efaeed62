import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, Upload, Building2, Palette, FileText, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface CompanyData {
  id: string;
  company_name: string;
  org_number: string;
  address: string;
  postal_code: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  bank_account: string;
  iban: string;
  swift: string;
  logo_url: string;
  default_payment_terms: string;
  default_offer_valid_days: number;
  default_offer_footer: string;
  default_offer_conditions: string;
  primary_color: string;
  secondary_color: string;
}

export default function CompanySettings() {
  const [data, setData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    const { data: rows } = await supabase.from("company_settings").select("*").limit(1).single();
    if (rows) setData(rows as unknown as CompanyData);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    const { id, ...payload } = data;
    const { error } = await supabase.from("company_settings").update(payload as any).eq("id", id);
    if (error) {
      toast.error("Kunne ikke lagre", { description: error.message });
    } else {
      toast.success("Firmainnstillinger lagret");
      setLastSaved(new Date());
    }
    setSaving(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !data) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `logo.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true });
    if (uploadErr) {
      toast.error("Opplasting feilet", { description: uploadErr.message });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("company-assets").getPublicUrl(path);
    setData({ ...data, logo_url: urlData.publicUrl });
    setUploading(false);
    toast.success("Logo lastet opp");
  };

  const update = (field: keyof CompanyData, value: string | number) => {
    if (!data) return;
    setData({ ...data, [field]: value });
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return <p className="p-6 text-muted-foreground">Ingen firmainnstillinger funnet.</p>;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Firma
          </h1>
          <p className="text-sm text-muted-foreground">Firmainnstillinger og tilbudskonfigurasjon</p>
        </div>
        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              Lagret {lastSaved.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lagre
          </Button>
        </div>
      </div>

      {/* Logo + Preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4" /> Visuell identitet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-6">
            <div className="space-y-2">
              <Label>Firmalogo</Label>
              {data.logo_url ? (
                <img src={data.logo_url} alt="Logo" className="h-16 max-w-[200px] object-contain rounded border p-1 bg-background" />
              ) : (
                <div className="h-16 w-32 rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground">
                  Ingen logo
                </div>
              )}
              <label className="inline-flex items-center gap-1.5 text-sm text-primary cursor-pointer hover:underline">
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Laster opp..." : "Last opp logo"}
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
              </label>
            </div>
            <div className="flex-1 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Primærfarge</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={data.primary_color} onChange={(e) => update("primary_color", e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
                    <Input value={data.primary_color} onChange={(e) => update("primary_color", e.target.value)} className="font-mono text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Sekundærfarge</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={data.secondary_color} onChange={(e) => update("secondary_color", e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
                    <Input value={data.secondary_color} onChange={(e) => update("secondary_color", e.target.value)} className="font-mono text-sm" />
                  </div>
                </div>
              </div>
              {/* Live offer header preview */}
              <div className="rounded-lg border p-4" style={{ borderTopColor: data.primary_color, borderTopWidth: 3 }}>
                <div className="flex items-center justify-between">
                  <div>
                    {data.logo_url ? (
                      <img src={data.logo_url} alt="" className="h-8 object-contain" />
                    ) : (
                      <span className="font-bold text-sm" style={{ color: data.primary_color }}>{data.company_name || "Firmanavn"}</span>
                    )}
                  </div>
                  <div className="text-right text-[10px] text-muted-foreground">
                    <p>{data.address}{data.postal_code ? `, ${data.postal_code} ${data.city}` : ""}</p>
                    <p>{data.phone} · {data.email}</p>
                    <p>Org.nr: {data.org_number || "—"}</p>
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground mt-2 italic">Forhåndsvisning av tilbudshode</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Firmainformasjon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Firmanavn</Label>
              <Input value={data.company_name} onChange={(e) => update("company_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Org.nr</Label>
              <Input value={data.org_number} onChange={(e) => update("org_number", e.target.value)} placeholder="123 456 789" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Adresse</Label>
            <Input value={data.address} onChange={(e) => update("address", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Postnr.</Label>
              <Input value={data.postal_code} onChange={(e) => update("postal_code", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Sted</Label>
              <Input value={data.city} onChange={(e) => update("city", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Land</Label>
              <Input value={data.country} onChange={(e) => update("country", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Telefon</Label>
              <Input value={data.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>E-post</Label>
              <Input value={data.email} onChange={(e) => update("email", e.target.value)} type="email" />
            </div>
            <div className="space-y-1.5">
              <Label>Nettside</Label>
              <Input value={data.website} onChange={(e) => update("website", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bank */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bankdetaljer</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Kontonummer</Label>
              <Input value={data.bank_account} onChange={(e) => update("bank_account", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>IBAN</Label>
              <Input value={data.iban} onChange={(e) => update("iban", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>SWIFT/BIC</Label>
              <Input value={data.swift} onChange={(e) => update("swift", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Offer defaults */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Tilbudsinnstillinger
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Betalingsbetingelser</Label>
              <Input value={data.default_payment_terms} onChange={(e) => update("default_payment_terms", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tilbud gyldig (dager)</Label>
              <Input type="number" value={data.default_offer_valid_days} onChange={(e) => update("default_offer_valid_days", Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Standard vilkår</Label>
            <Textarea value={data.default_offer_conditions} onChange={(e) => update("default_offer_conditions", e.target.value)} rows={3} placeholder="Standard vilkår og betingelser for tilbud..." />
          </div>
          <div className="space-y-1.5">
            <Label>Tilbudsfot (vises nederst på PDF)</Label>
            <Textarea value={data.default_offer_footer} onChange={(e) => update("default_offer_footer", e.target.value)} rows={2} placeholder="Tekst som vises i bunn av tilbudet..." />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
