import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Loader2, Users2, Plus, FolderKanban, Phone, Mail, MapPin,
  Building2, Save, UserPlus, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { JOB_STATUS_CONFIG, type JobStatus } from "@/lib/job-status";

interface Customer {
  id: string;
  name: string;
  org_number: string | null;
  main_email: string | null;
  main_phone: string | null;
  billing_address: string | null;
  billing_zip: string | null;
  billing_city: string | null;
  notes: string | null;
  created_at: string;
}

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
}

interface ProjectRow {
  id: string;
  title: string;
  status: JobStatus;
  start_time: string;
  internal_number: string | null;
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Edit state
  const [editName, setEditName] = useState("");
  const [editOrg, setEditOrg] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editZip, setEditZip] = useState("");
  const [editCity, setEditCity] = useState("");

  // New contact form
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactRole, setNewContactRole] = useState("");
  const [addingContact, setAddingContact] = useState(false);

  const fetchCustomer = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .single();
    if (data) {
      const c = data as any;
      setCustomer(c);
      setEditName(c.name);
      setEditOrg(c.org_number || "");
      setEditEmail(c.main_email || "");
      setEditPhone(c.main_phone || "");
      setEditAddress(c.billing_address || "");
      setEditZip(c.billing_zip || "");
      setEditCity(c.billing_city || "");
    }
    setLoading(false);
  }, [id]);

  const fetchProjects = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("events")
      .select("id, title, status, start_time, internal_number")
      .eq("customer_id", id)
      .is("deleted_at", null)
      .order("start_time", { ascending: false });
    if (data) setProjects(data as any);
  }, [id]);

  const fetchContacts = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("customer_contacts")
      .select("*")
      .eq("customer_id", id)
      .order("created_at", { ascending: true });
    if (data) setContacts(data as any);
  }, [id]);

  useEffect(() => {
    fetchCustomer();
    fetchProjects();
    fetchContacts();
  }, [fetchCustomer, fetchProjects, fetchContacts]);

  const handleSave = async () => {
    if (!customer) return;
    setSaving(true);
    const { error } = await supabase
      .from("customers")
      .update({
        name: editName.trim(),
        org_number: editOrg.trim() || null,
        main_email: editEmail.trim() || null,
        main_phone: editPhone.trim() || null,
        billing_address: editAddress.trim() || null,
        billing_zip: editZip.trim() || null,
        billing_city: editCity.trim() || null,
      } as any)
      .eq("id", customer.id);
    if (error) toast.error("Kunne ikke lagre", { description: error.message });
    else {
      toast.success("Kunde oppdatert");
      fetchCustomer();
    }
    setSaving(false);
  };

  const handleAddContact = async () => {
    if (!id || !newContactName.trim()) return;
    setAddingContact(true);
    const { error } = await supabase.from("customer_contacts").insert({
      customer_id: id,
      name: newContactName.trim(),
      email: newContactEmail.trim() || null,
      phone: newContactPhone.trim() || null,
      role: newContactRole.trim() || null,
    } as any);
    if (error) toast.error("Kunne ikke legge til kontakt");
    else {
      toast.success("Kontakt lagt til");
      setNewContactName(""); setNewContactEmail(""); setNewContactPhone(""); setNewContactRole("");
      fetchContacts();
    }
    setAddingContact(false);
  };

  const handleDeleteContact = async (contactId: string) => {
    const { error } = await supabase.from("customer_contacts").delete().eq("id", contactId);
    if (error) toast.error("Kunne ikke slette kontakt");
    else { toast.success("Kontakt slettet"); fetchContacts(); }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  if (!customer) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold">Kunde ikke funnet</p>
          <Button variant="outline" onClick={() => navigate("/customers")}>Tilbake til kunder</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-card">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 border-b border-primary/10 bg-gradient-to-r from-primary/[0.03] to-transparent backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Button variant="ghost" size="icon" onClick={() => navigate("/customers")} className="shrink-0 mt-0.5 rounded-xl h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-lg font-bold tracking-tight truncate">{customer.name}</h1>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  {customer.org_number && <span className="font-mono">Org: {customer.org_number}</span>}
                  {customer.billing_city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{customer.billing_city}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="default" onClick={() => navigate(`/projects/new?customer=${customer.id}`)} className="gap-1.5 rounded-xl">
                <Plus className="h-3.5 w-3.5" /> Nytt prosjekt
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
        <Tabs defaultValue="projects" className="space-y-4">
          <TabsList className="rounded-xl">
            <TabsTrigger value="projects" className="rounded-lg gap-1.5">
              <FolderKanban className="h-3.5 w-3.5" /> Prosjekter ({projects.length})
            </TabsTrigger>
            <TabsTrigger value="contacts" className="rounded-lg gap-1.5">
              <UserPlus className="h-3.5 w-3.5" /> Kontakter ({contacts.length})
            </TabsTrigger>
            <TabsTrigger value="info" className="rounded-lg gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Info
            </TabsTrigger>
          </TabsList>

          {/* Projects tab */}
          <TabsContent value="projects" className="space-y-4">
            {projects.length === 0 ? (
              <Card className="rounded-2xl">
                <CardContent className="flex flex-col items-center py-12 text-center space-y-3">
                  <FolderKanban className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Ingen prosjekter knyttet til denne kunden ennå.</p>
                  <Button size="sm" onClick={() => navigate(`/projects/new?customer=${customer.id}`)} className="gap-1.5 rounded-xl">
                    <Plus className="h-3.5 w-3.5" /> Opprett prosjekt
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {projects.map((p) => (
                  <Card
                    key={p.id}
                    className="rounded-2xl cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <CardContent className="flex items-center justify-between py-3 px-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.internal_number && <span className="font-mono mr-2">{p.internal_number}</span>}
                          {format(new Date(p.start_time), "d. MMM yyyy", { locale: nb })}
                        </p>
                      </div>
                      <Badge
                        className="text-[10px] whitespace-nowrap rounded-lg shrink-0"
                        style={{
                          backgroundColor: `hsl(var(--status-${p.status.replace(/_/g, "-")}))`,
                          color: `hsl(var(--status-${p.status.replace(/_/g, "-")}-foreground))`,
                        }}
                      >
                        {JOB_STATUS_CONFIG[p.status]?.label || p.status}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Contacts tab */}
          <TabsContent value="contacts" className="space-y-4">
            {contacts.map((c) => (
              <Card key={c.id} className="rounded-2xl">
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {c.role && <span>{c.role}</span>}
                      {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                      {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                    </div>
                  </div>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteContact(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}

            {/* Add contact form */}
            {isAdmin && (
              <Card className="rounded-2xl border-dashed">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><UserPlus className="h-4 w-4" /> Legg til kontakt</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Navn *</Label>
                      <Input value={newContactName} onChange={(e) => setNewContactName(e.target.value)} placeholder="Kontaktnavn" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Rolle</Label>
                      <Input value={newContactRole} onChange={(e) => setNewContactRole(e.target.value)} placeholder="F.eks. Prosjektleder" className="h-8 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">E-post</Label>
                      <Input value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} placeholder="epost@firma.no" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Telefon</Label>
                      <Input value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} placeholder="12345678" className="h-8 text-sm" />
                    </div>
                  </div>
                  <Button size="sm" onClick={handleAddContact} disabled={!newContactName.trim() || addingContact} className="rounded-xl gap-1.5">
                    {addingContact ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Legg til
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Info tab */}
          <TabsContent value="info">
            <Card className="rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Kundeinformasjon</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Kundenavn</Label>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Org.nr</Label>
                    <Input value={editOrg} onChange={(e) => setEditOrg(e.target.value)} placeholder="123 456 789" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>E-post</Label>
                    <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} type="email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telefon</Label>
                    <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Fakturaadresse</Label>
                  <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Postnr</Label>
                    <Input value={editZip} onChange={(e) => setEditZip(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sted</Label>
                    <Input value={editCity} onChange={(e) => setEditCity(e.target.value)} />
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex justify-end pt-2">
                    <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-1.5">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Lagre
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
