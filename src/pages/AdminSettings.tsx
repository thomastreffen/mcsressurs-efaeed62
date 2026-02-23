import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, CheckCircle, Settings, Wrench, TrendingUp, FileSignature, BookOpen, Bell } from "lucide-react";
import { toast } from "sonner";

type SettingsMap = Record<string, Record<string, any>>;

export default function AdminSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from("tenant_settings" as any).select("key, value");
    const map: SettingsMap = {};
    for (const row of (data || []) as any[]) {
      map[row.key] = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    }
    setSettings(map);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const updateSetting = (section: string, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(settings)) {
        await supabase.from("tenant_settings" as any).update({ value, updated_at: new Date().toISOString(), updated_by: user?.id } as any).eq("key", key);
      }
      toast.success("Innstillinger lagret");
      setLastSaved(new Date());
    } catch {
      toast.error("Kunne ikke lagre innstillinger");
    }
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const drift = settings.drift || {};
  const salg = settings.salg || {};
  const kontrakt = settings.kontrakt || {};
  const fag = settings.fag || {};
  const varsler = settings.varsler || {};

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Innstillinger
          </h1>
          <p className="text-sm text-muted-foreground">Systeminnstillinger for drift, salg, kontrakter og varsler</p>
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

      <Tabs defaultValue="drift">
        <TabsList className="flex-wrap">
          <TabsTrigger value="drift" className="gap-1.5"><Wrench className="h-3.5 w-3.5" />Drift</TabsTrigger>
          <TabsTrigger value="salg" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" />Salg</TabsTrigger>
          <TabsTrigger value="kontrakt" className="gap-1.5"><FileSignature className="h-3.5 w-3.5" />Kontrakt</TabsTrigger>
          <TabsTrigger value="fag" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" />Fag</TabsTrigger>
          <TabsTrigger value="varsler" className="gap-1.5"><Bell className="h-3.5 w-3.5" />Varsler</TabsTrigger>
        </TabsList>

        <TabsContent value="drift" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Drift-innstillinger</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Standard jobbstatus ved opprettelse</Label>
                <Input value={drift.default_job_status || "requested"} onChange={e => updateSetting("drift", "default_job_status", e.target.value)} />
                <p className="text-xs text-muted-foreground">Teknisk nøkkel: requested, approved, scheduled, etc.</p>
              </div>
              <ToggleRow label="Auto-opprett Teams-møte" description="Opprett Teams-møte automatisk ved ny jobb" checked={!!drift.auto_create_teams} onChange={v => updateSetting("drift", "auto_create_teams", v)} />
              <ToggleRow label="Krev Outlook-sync før Planlagt" description='Jobb kan ikke settes til "Planlagt" uten sync' checked={!!drift.require_outlook_sync_before_planned} onChange={v => updateSetting("drift", "require_outlook_sync_before_planned", v)} />
              <div className="space-y-1.5">
                <Label>Standard arbeidstid per dag (timer)</Label>
                <Input type="number" value={drift.default_work_hours_per_day || 8} onChange={e => updateSetting("drift", "default_work_hours_per_day", Number(e.target.value))} className="w-24" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="salg" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Salgsinnstillinger</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Standard sannsynlighet ved ny lead (%)</Label>
                <Input type="number" value={salg.default_probability || 50} onChange={e => updateSetting("salg", "default_probability", Number(e.target.value))} className="w-24" />
              </div>
              <ToggleRow label="Auto-opprett jobb ved vunnet" description="Opprett jobb automatisk når lead/tilbud vinnes" checked={!!salg.auto_create_job_on_won} onChange={v => updateSetting("salg", "auto_create_job_on_won", v)} />
              <div className="space-y-1.5">
                <Label>Standard tilbudsforbehold</Label>
                <Textarea value={salg.default_offer_conditions || ""} onChange={e => updateSetting("salg", "default_offer_conditions", e.target.value)} rows={3} placeholder="Forbehold som legges til nye tilbud..." />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kontrakt" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Kontraktinnstillinger</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Standard lead time (dager)</Label>
                <Input type="number" value={kontrakt.default_lead_time_days || 30} onChange={e => updateSetting("kontrakt", "default_lead_time_days", Number(e.target.value))} className="w-24" />
              </div>
              <div className="space-y-1.5">
                <Label>Standard varseldager før frist</Label>
                <Input value={(kontrakt.default_notify_days_before || [30,14,7,2,0]).join(", ")} onChange={e => updateSetting("kontrakt", "default_notify_days_before", e.target.value.split(",").map(s => Number(s.trim())).filter(n => !isNaN(n)))} />
                <p className="text-xs text-muted-foreground">Kommaseparerte tall, f.eks: 30, 14, 7, 2, 0</p>
              </div>
              <div className="space-y-1.5">
                <Label>Risiko-terskel for rød (score)</Label>
                <Input type="number" value={kontrakt.risk_threshold_red || 70} onChange={e => updateSetting("kontrakt", "risk_threshold_red", Number(e.target.value))} className="w-24" />
              </div>
              <ToggleRow label="Krev godkjenning før Signert" description='Kontrakt kan ikke settes til "Signert" uten godkjenning' checked={!!kontrakt.require_approval_before_signed} onChange={v => updateSetting("kontrakt", "require_approval_before_signed", v)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fag" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Faginnstillinger</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ToggleRow label="Krev godkjenning før bruk i kalkyle" description="Fagforespørsler må godkjennes før de brukes i kalkulasjoner" checked={!!fag.require_approval_for_calc} onChange={v => updateSetting("fag", "require_approval_for_calc", v)} />
              <ToggleRow label="Tillat revisjoner" description="Tillat at godkjente forespørsler kan revideres" checked={fag.allow_revisions !== false} onChange={v => updateSetting("fag", "allow_revisions", v)} />
              <ToggleRow label="Auto-pin populære forespørsler" description="Pin forespørsler automatisk basert på bruksfrekvens" checked={!!fag.auto_pin_popular} onChange={v => updateSetting("fag", "auto_pin_popular", v)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="varsler" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Varslingsinnstillinger</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ToggleRow label="Send e-post ved kritiske frister" description="Send automatisk e-postvarsling ved kritiske kontraktfrister" checked={varsler.email_on_critical_deadlines !== false} onChange={v => updateSetting("varsler", "email_on_critical_deadlines", v)} />
              <ToggleRow label="Intercompany varsling" description="Send varsler til brukere i utførende selskaper" checked={varsler.intercompany_notifications !== false} onChange={v => updateSetting("varsler", "intercompany_notifications", v)} />
              <div className="space-y-1.5">
                <Label>Standard varseldager (fallback)</Label>
                <Input value={(varsler.default_notify_days || [14,7,2]).join(", ")} onChange={e => updateSetting("varsler", "default_notify_days", e.target.value.split(",").map(s => Number(s.trim())).filter(n => !isNaN(n)))} />
                <p className="text-xs text-muted-foreground">Kommaseparerte tall, f.eks: 14, 7, 2</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
