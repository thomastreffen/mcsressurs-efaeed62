import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Building2, Mail } from "lucide-react";

type Mailbox = {
  id: string;
  address: string;
  display_name: string;
  is_enabled: boolean;
  created_at: string;
};

export function MailboxConfig() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAddress, setNewAddress] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchMailboxes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("mailboxes").select("*").order("created_at");
    setMailboxes((data as unknown as Mailbox[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMailboxes();
  }, [fetchMailboxes]);

  const addMailbox = async () => {
    if (!newAddress.trim()) { toast.error("Skriv inn en e-postadresse"); return; }
    setAdding(true);
    const { error } = await supabase.from("mailboxes").insert({
      address: newAddress.trim().toLowerCase(),
      display_name: newDisplayName.trim() || newAddress.trim(),
      is_enabled: false,
    } as any);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Denne adressen finnes allerede" : error.message);
    } else {
      toast.success("Postboks lagt til");
      setNewAddress("");
      setNewDisplayName("");
      fetchMailboxes();
    }
    setAdding(false);
  };

  const toggleEnabled = async (mb: Mailbox) => {
    await supabase.from("mailboxes").update({ is_enabled: !mb.is_enabled } as any).eq("id", mb.id);
    toast.success(mb.is_enabled ? "Postboks deaktivert" : "Postboks aktivert");
    fetchMailboxes();
  };

  const deleteMailbox = async (mb: Mailbox) => {
    if (!confirm(`Slette postboks ${mb.address}?`)) return;
    await supabase.from("mailboxes").delete().eq("id", mb.id);
    toast.success("Postboks slettet");
    fetchMailboxes();
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Postkontor-postbokser</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Konfigurer hvilke delte postbokser (shared mailboxes) som skal synkroniseres til Postkontoret.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing mailboxes */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Laster...</p>
        ) : mailboxes.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <Mail className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Ingen postbokser konfigurert</p>
          </div>
        ) : (
          <div className="space-y-2">
            {mailboxes.map((mb) => (
              <div key={mb.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{mb.display_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{mb.address}</p>
                </div>
                <Badge variant={mb.is_enabled ? "default" : "secondary"} className="text-[10px]">
                  {mb.is_enabled ? "Aktiv" : "Inaktiv"}
                </Badge>
                <Switch checked={mb.is_enabled} onCheckedChange={() => toggleEnabled(mb)} />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteMailbox(mb)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add new */}
        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-sm font-medium">Legg til postboks</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">E-postadresse</Label>
              <Input
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="postkontoret@firma.no"
                type="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Visningsnavn</Label>
              <Input
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="Postkontoret"
              />
            </div>
          </div>
          <Button size="sm" onClick={addMailbox} disabled={adding} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Legg til
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
