import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Users2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export default function CustomerNewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCompanyId } = useCompanyContext();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [orgNumber, setOrgNumber] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    const { data, error } = await supabase
      .from("customers")
      .insert({
        name: name.trim(),
        org_number: orgNumber.trim() || null,
        main_email: email.trim() || null,
        main_phone: phone.trim() || null,
        billing_address: address.trim() || null,
        billing_zip: zip.trim() || null,
        billing_city: city.trim() || null,
        notes: notes.trim() || null,
        company_id: activeCompanyId || null,
        created_by: user?.id || null,
      } as any)
      .select("id")
      .single();

    if (error) {
      toast.error("Kunne ikke opprette kunde", { description: error.message });
      setSaving(false);
      return;
    }

    toast.success("Kunde opprettet", { description: name });
    navigate(`/customers/${data.id}`);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/customers")} className="rounded-xl h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Users2 className="h-5 w-5 text-primary" />
            Ny kunde
          </h1>
          <p className="text-sm text-muted-foreground">Opprett en ny kunde i systemet</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Kundeinformasjon</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Kundenavn *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Firmanavn eller privatperson"
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="orgNumber">Organisasjonsnummer</Label>
                <Input
                  id="orgNumber"
                  value={orgNumber}
                  onChange={(e) => setOrgNumber(e.target.value)}
                  placeholder="123 456 789"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-post</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="post@kunde.no"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="12345678"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address">Fakturaadresse</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Gateadresse"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="zip">Postnr</Label>
                <Input
                  id="zip"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="0000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">Sted</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="By"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notater</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Interne notater om kunden..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="outline" onClick={() => navigate("/customers")} className="rounded-xl">
            Avbryt
          </Button>
          <Button type="submit" disabled={saving || !name.trim()} className="rounded-xl gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Opprett kunde
          </Button>
        </div>
      </form>
    </div>
  );
}
