import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TechnicianMultiSelect } from "@/components/TechnicianMultiSelect";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calculationId: string;
  offerId?: string;
  defaultTitle?: string;
  defaultCustomer?: string;
  defaultDescription?: string;
}

export function ConvertToJobDialog({ open, onOpenChange, calculationId, offerId, defaultTitle, defaultCustomer, defaultDescription }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState(defaultTitle || "");
  const [customer, setCustomer] = useState(defaultCustomer || "");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState(defaultDescription || "");
  const [selectedTechs, setSelectedTechs] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [notify, setNotify] = useState(true);

  const handleCreate = async () => {
    if (!title.trim()) { toast.error("Tittel er påkrevd"); return; }
    if (selectedTechs.length === 0) { toast.error("Velg minst én montør"); return; }
    if (!startDate) { toast.error("Velg startdato"); return; }
    setCreating(true);

    const start = new Date(startDate);
    start.setHours(8, 0, 0, 0);
    const end = new Date(start);
    end.setHours(16, 0, 0, 0);

    const { data: event, error } = await supabase.from("events").insert({
      title: title.trim(),
      customer: customer.trim() || null,
      address: address.trim() || null,
      description: description.trim() || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: "scheduled",
      technician_id: selectedTechs[0],
      created_by: user?.id,
      offer_id: offerId || null,
    }).select("id").single();

    if (error) {
      toast.error("Kunne ikke opprette jobb", { description: error.message });
      setCreating(false);
      return;
    }

    const techInserts = selectedTechs.map((techId) => ({ event_id: event.id, technician_id: techId }));
    await supabase.from("event_technicians").insert(techInserts);

    // Mark calculation as converted
    await supabase.from("calculations").update({ status: "converted" }).eq("id", calculationId);

    toast.success("Konvertert til prosjekt");
    onOpenChange(false);
    navigate(`/jobs/${event.id}`);
    setCreating(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Konverter til prosjekt</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Jobbtittel *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Kunde</Label>
            <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Adresse</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Prosjektadresse" />
          </div>
          <div className="space-y-1.5">
            <Label>Beskrivelse</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Montør(er) *</Label>
            <TechnicianMultiSelect
              selectedIds={selectedTechs}
              onChange={setSelectedTechs}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Startdato *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2 font-normal">
                  <CalendarDays className="h-4 w-4" />
                  {startDate ? format(startDate, "EEEE d. MMMM yyyy", { locale: nb }) : "Velg dato"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={nb} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Varsle deltakere</p>
              <p className="text-xs text-muted-foreground">Send varsel til valgte montører</p>
            </div>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Opprett jobb
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
