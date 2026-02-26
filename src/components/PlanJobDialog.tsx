import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CalendarDays, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTechnicians } from "@/hooks/useTechnicians";

interface PlanJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  caseTitle: string;
  companyId: string;
  existingProjectId: string | null;
  onPlanned: (projectId: string, workOrderId: string) => void;
}

const DURATION_OPTIONS = [
  { value: "30", label: "30 min" },
  { value: "60", label: "1 time" },
  { value: "90", label: "1,5 timer" },
  { value: "120", label: "2 timer" },
  { value: "180", label: "3 timer" },
  { value: "240", label: "4 timer" },
  { value: "480", label: "Hel dag (8t)" },
];

export function PlanJobDialog({
  open,
  onOpenChange,
  caseId,
  caseTitle,
  companyId,
  existingProjectId,
  onPlanned,
}: PlanJobDialogProps) {
  const { technicians } = useTechnicians();
  const [techId, setTechId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [duration, setDuration] = useState("60");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!techId || !date || !startTime) {
      toast.error("Velg ressurs, dato og starttid");
      return;
    }

    setSaving(true);
    try {
      const startsAt = new Date(`${date}T${startTime}:00`);
      const endsAt = new Date(startsAt.getTime() + Number(duration) * 60000);

      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      let projectId = existingProjectId;

      // Create project (event) if none exists
      if (!projectId) {
        const { data: proj, error: projErr } = await supabase
          .from("events")
          .insert({
            title: caseTitle,
            technician_id: techId,
            start_time: startsAt.toISOString(),
            end_time: endsAt.toISOString(),
            status: "planned",
            project_type: "service",
            company_id: companyId,
            created_by: userId,
            description: note || `Fra henvendelse: ${caseTitle}`,
          } as any)
          .select("id")
          .single();

        if (projErr) throw projErr;
        projectId = proj.id;

        // Link technician
        await supabase.from("event_technicians").insert({
          event_id: projectId,
          technician_id: techId,
        } as any);
      }

      // Create work_order
      const { data: wo, error: woErr } = await supabase
        .from("work_orders")
        .insert({
          company_id: companyId,
          project_id: projectId,
          case_id: caseId,
          title: caseTitle,
          description: note || null,
          status: "planned",
          technician_id: techId,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          created_by: userId,
        } as any)
        .select("id")
        .single();

      if (woErr) throw woErr;

      // Update case: set project_id, work_order_id, status = converted
      await supabase.from("cases").update({
        project_id: projectId,
        work_order_id: wo.id,
        status: "converted",
      } as any).eq("id", caseId);

      // Add system log to case_items
      await supabase.from("case_items").insert({
        case_id: caseId,
        company_id: companyId,
        type: "system",
        subject: "Jobb planlagt",
        body_preview: `Oppdrag opprettet for ${technicians.find((t) => t.id === techId)?.name || "montør"} – ${date} kl. ${startTime} (${duration} min)`,
        created_by: userId,
      } as any);

      toast.success("Jobb planlagt og oppdrag opprettet!");
      onPlanned(projectId!, wo.id);
      onOpenChange(false);

      // Reset
      setTechId("");
      setDate("");
      setStartTime("08:00");
      setDuration("60");
      setNote("");
    } catch (err: any) {
      console.error("PlanJob error:", err);
      toast.error("Kunne ikke planlegge jobb: " + (err.message || "Ukjent feil"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Planlegg jobb
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">Henvendelse</Label>
            <p className="text-sm font-medium mt-1 truncate">{caseTitle}</p>
          </div>

          <div>
            <Label className="text-xs">Ressurs / Montør</Label>
            <Select value={techId} onValueChange={setTechId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Velg montør" />
              </SelectTrigger>
              <SelectContent>
                {technicians.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color || "#6366f1" }} />
                      {t.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Dato</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Starttid</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Varighet</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Notat (valgfritt)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Beskrivelse, instrukser…" className="mt-1" rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Planlegg
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
