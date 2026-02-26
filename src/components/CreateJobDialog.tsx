import { useState, useEffect, useCallback, Component, type ReactNode, type ErrorInfo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TechnicianMultiSelect } from "./TechnicianMultiSelect";
import { FileUpload } from "./FileUpload";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { useCalendarSync } from "@/hooks/useCalendarSync";

interface CreateJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedTechId?: string;
  onJobCreated?: () => void;
}

interface ErrorBoundaryProps { children: ReactNode; onReset: () => void }
interface ErrorBoundaryState { hasError: boolean; errorMsg: string }

class CreateJobErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, errorMsg: "" };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error?.message || "Unknown error" };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CreateJobDialog crashed:", error?.message, error?.stack, info?.componentStack);
    this.props.onReset();
  }
  render() {
    if (this.state.hasError) {
      return (
        <p className="p-4 text-sm text-destructive">
          Noe gikk galt: {this.state.errorMsg}. Prøv å lukke og åpne dialogen på nytt.
        </p>
      );
    }
    return this.props.children;
  }
}

interface ConflictInfo {
  technicianName: string;
  jobTitle: string;
  start: string;
  end: string;
}

function CreateJobDialogInner({
  open,
  onOpenChange,
  preselectedTechId,
  onJobCreated,
}: CreateJobDialogProps) {
  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("16:00");
  const [techIds, setTechIds] = useState<string[]>(preselectedTechId ? [preselectedTechId] : []);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const { syncCreate } = useCalendarSync();

  // DB-based conflict check
  const checkConflicts = useCallback(async () => {
    const ids = Array.isArray(techIds) ? techIds : [];
    if (!startDate || !startTime || !endDate || !endTime || ids.length === 0) {
      setConflicts([]);
      return;
    }
    const startISO = new Date(`${startDate}T${startTime}`).toISOString();
    const endISO = new Date(`${endDate}T${endTime}`).toISOString();

    const { data: overlapping } = await supabase
      .from("event_technicians")
      .select(`
        technician_id,
        technicians ( name ),
        events:event_id ( id, title, start_time, end_time )
      `)
      .in("technician_id", ids);

    if (!overlapping) { setConflicts([]); return; }

    const found: ConflictInfo[] = [];
    for (const row of overlapping as any[]) {
      const ev = row.events;
      if (!ev) continue;
      if (ev.start_time < endISO && ev.end_time > startISO) {
        found.push({
          technicianName: row.technicians?.name ?? "Ukjent",
          jobTitle: ev.title?.replace("SERVICE – ", "") ?? "",
          start: format(new Date(ev.start_time), "HH:mm"),
          end: format(new Date(ev.end_time), "HH:mm"),
        });
      }
    }
    setConflicts(found);
  }, [techIds, startDate, startTime, endDate, endTime]);

  useEffect(() => {
    if (open) checkConflicts();
  }, [open, checkConflicts]);

  const safeTechIds = Array.isArray(techIds) ? techIds : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (safeTechIds.length === 0) return;
    setSubmitting(true);

    try {
      // 1. Insert event
      const startISO = new Date(`${startDate}T${startTime}`).toISOString();
      const endISO = new Date(`${endDate}T${endTime}`).toISOString();

      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const { data: createdEvent, error: eventError } = await supabase
        .from("events")
        .insert({
          title: `SERVICE – ${title}`,
          customer,
          address,
          description,
          job_number: jobNumber || null,
          start_time: startISO,
          end_time: endISO,
          technician_id: safeTechIds[0],
          status: "requested",
          created_by: userId || null,
        })
        .select("id")
        .single();

      if (eventError || !createdEvent) {
        console.error("[CreateJob] Event insert failed:", eventError);
        toast.error("Kunne ikke opprette jobb", { description: eventError?.message });
        setSubmitting(false);
        return;
      }

      console.log("[CreateJob] Event created:", createdEvent.id);

      // 2. Upload files to storage and save attachment metadata
      if (files.length > 0) {
        const attachments: { name: string; url: string; size: number }[] = [];

        for (const file of files) {
          const filePath = `${createdEvent.id}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from("job-attachments")
            .upload(filePath, file);

          if (uploadError) {
            console.error("[CreateJob] File upload failed:", file.name, uploadError);
            toast.error(`Kunne ikke laste opp ${file.name}`);
            continue;
          }

          const { data: urlData } = supabase.storage
            .from("job-attachments")
            .getPublicUrl(filePath);

          attachments.push({
            name: file.name,
            url: urlData.publicUrl,
            size: file.size,
          });
          console.log("[CreateJob] File uploaded:", file.name);
        }

        if (attachments.length > 0) {
          const { error: attError } = await supabase
            .from("events")
            .update({ attachments })
            .eq("id", createdEvent.id);

          if (attError) {
            console.error("[CreateJob] Attachment metadata save failed:", attError);
          }
        }
      }

      // 3. Insert event_technicians
      const techInserts = safeTechIds.map((techId) => ({
        event_id: createdEvent.id,
        technician_id: techId,
      }));

      const { error: techError } = await supabase
        .from("event_technicians")
        .insert(techInserts);

      if (techError) {
        console.error("[CreateJob] Technician assignment failed:", techError);
        toast.error("Jobb opprettet, men montørtilknytning feilet", { description: techError.message });
      }

      // 4. Call create-approval
      console.log("[CreateJob] Calling create-approval for job:", createdEvent.id);
      const { data: approvalData, error: approvalError } = await supabase.functions.invoke(
        "create-approval",
        { body: { job_id: createdEvent.id } }
      );

      if (approvalError) {
        console.error("[CreateJob] create-approval invocation failed:", approvalError);
        toast.error("Jobb opprettet, men godkjenningsforespørsel feilet", {
          description: approvalError.message,
        });
      } else if (approvalData?.error) {
        console.error("[CreateJob] create-approval returned error:", approvalData.error);
        toast.error("Jobb opprettet, men godkjenningsforespørsel feilet", {
          description: approvalData.error,
        });
      } else {
        console.log("[CreateJob] create-approval success:", approvalData);
        toast.success("Jobb opprettet og godkjenning sendt", {
          description: `SERVICE – ${title} er sendt til ${safeTechIds.length} montør(er).`,
        });
        // Sync to Outlook
        syncCreate(createdEvent.id);
      }

      onOpenChange(false);
      resetForm();
      onJobCreated?.();
    } catch (err: any) {
      console.error("[CreateJob] Unexpected error:", err);
      toast.error("Noe gikk galt", { description: err?.message || "Ukjent feil" });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setCustomer("");
    setAddress("");
    setDescription("");
    setJobNumber("");
    setStartDate("");
    setEndDate("");
    setTechIds(preselectedTechId ? [preselectedTechId] : []);
    setFiles([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ny jobb</DialogTitle>
          <DialogDescription className="sr-only">Opprett en ny jobb for montører</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title">Tittel</Label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  SERVICE –
                </span>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Beskrivelse av jobb"
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="jobNumber">Jobbnummer (valgfritt)</Label>
              <Input
                id="jobNumber"
                value={jobNumber}
                onChange={(e) => setJobNumber(e.target.value)}
                placeholder="F.eks. P-12345"
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="customer">Kunde</Label>
              <Input
                id="customer"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Kundenavn"
                required
                className="mt-1"
              />
            </div>
            <TechnicianMultiSelect selectedIds={techIds} onChange={setTechIds} />
          </div>

          <div>
            <Label htmlFor="address">Adresse</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Gateadresse, postnr, sted"
              required
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!endDate) setEndDate(e.target.value);
                  }}
                  required
                />
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className="w-28"
                />
              </div>
            </div>
            <div>
              <Label>Slutt</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  className="w-28"
                />
              </div>
            </div>
          </div>

          {/* Conflict warning */}
          {conflicts.length > 0 && (
            <div className="rounded-lg border-2 border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <p className="text-sm font-medium">Overlappende jobber</p>
              </div>
              <div className="space-y-1">
                {conflicts.map((c, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.technicianName}</span> har allerede{" "}
                    <span className="font-medium">"{c.jobTitle}"</span> {c.start}–{c.end}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="description">Beskrivelse</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kort beskrivelse av jobben..."
              rows={3}
              className="mt-1"
            />
          </div>

          <FileUpload files={files} onChange={setFiles} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={safeTechIds.length === 0 || submitting}>
              {submitting ? "Oppretter..." : "Opprett jobb"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateJobDialog(props: CreateJobDialogProps) {
  const resetOnError = () => {
    props.onOpenChange(false);
  };
  return (
    <CreateJobErrorBoundary onReset={resetOnError}>
      <CreateJobDialogInner {...props} />
    </CreateJobErrorBoundary>
  );
}
