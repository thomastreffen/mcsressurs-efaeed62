import { useState, useEffect, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TechnicianMultiSelect } from "./TechnicianMultiSelect";
import { FileUpload } from "./FileUpload";
import { AttendeeStatusList } from "./AttendeeStatusList";
import { AttachmentList } from "./AttachmentList";
import { ConflictWarning } from "./ConflictWarning";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { technicians, getConflicts, type Job, type Attachment } from "@/lib/mock-data";
import {
  MapPin,
  Clock,
  Building2,
  Pencil,
  Copy,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

interface JobDetailSheetProps {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDuplicate?: (job: Job) => void;
}

export function JobDetailSheet({ job, open, onOpenChange, onDuplicate }: JobDetailSheetProps) {
  const [mode, setMode] = useState<"view" | "edit">("view");

  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [techIds, setTechIds] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    if (open && job) setMode("view");
  }, [open, job]);

  const populateEditForm = () => {
    if (!job) return;
    setTitle(job.title.replace("SERVICE – ", ""));
    setCustomer(job.customer);
    setAddress(job.address);
    setDescription(job.description);
    setStartDate(format(job.start, "yyyy-MM-dd"));
    setStartTime(format(job.start, "HH:mm"));
    setEndDate(format(job.end, "yyyy-MM-dd"));
    setEndTime(format(job.end, "HH:mm"));
    setTechIds(job.technicianIds);
    setFiles([]);
    setExistingAttachments(job.attachments || []);
  };

  // Conflict detection for edit mode
  const editConflicts = useMemo(() => {
    if (mode !== "edit" || !startDate || !startTime || !endDate || !endTime || techIds.length === 0) return [];
    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(`${endDate}T${endTime}`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
    return getConflicts(techIds, start, end, job?.id);
  }, [mode, techIds, startDate, startTime, endDate, endTime, job?.id]);

  if (!job) return null;

  const hasChangeRequest = job.attendeeStatuses.some((a) => a.status === "change-request");

  const handleEdit = () => {
    populateEditForm();
    setMode("edit");
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (techIds.length === 0) return;
    toast.success("Jobb oppdatert", { description: `SERVICE – ${title} er lagret.` });
    onOpenChange(false);
  };

  const handleAcceptProposal = (techId: string) => {
    const tech = technicians.find((t) => t.id === techId);
    toast.success("Nytt tidspunkt godtatt", {
      description: `Forslaget fra ${tech?.name} er godtatt. Alle deltakere oppdateres.`,
    });
    onOpenChange(false);
  };

  const handleDeclineProposal = (techId: string) => {
    const tech = technicians.find((t) => t.id === techId);
    toast.info("Foreslått tidspunkt avvist", {
      description: `Forslaget fra ${tech?.name} er avvist, opprinnelig tidspunkt beholdt.`,
    });
  };

  const handleCancel = () => {
    toast.error("Jobb avlyst");
    onOpenChange(false);
  };

  const handleRemoveExisting = (name: string) => {
    setExistingAttachments((prev) => prev.filter((a) => a.name !== name));
    toast.info(`Vedlegg "${name}" fjernet`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        {mode === "view" ? (
          <>
            <SheetHeader>
              <SheetTitle className="text-left">{job.title}</SheetTitle>
            </SheetHeader>

            <div className="mt-6 space-y-5">
              <div className="flex items-center justify-end gap-1.5">
                <Button size="sm" variant="outline" onClick={handleEdit} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" />
                  Rediger
                </Button>
                {onDuplicate && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { onDuplicate(job); onOpenChange(false); }}
                    className="gap-1.5"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Dupliser
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 text-sm">
                  <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <p>{job.customer}</p>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <p>{job.address}</p>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p>{format(job.start, "EEEE d. MMMM yyyy", { locale: nb })}</p>
                    <p className="text-muted-foreground">
                      {format(job.start, "HH:mm")} – {format(job.end, "HH:mm")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Per-attendee status */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Montører</p>
                <AttendeeStatusList attendeeStatuses={job.attendeeStatuses} />
              </div>

              {/* Change request actions per attendee */}
              {hasChangeRequest && (
                <div className="space-y-2">
                  {job.attendeeStatuses
                    .filter((a) => a.status === "change-request" && a.proposedStart && a.proposedEnd)
                    .map((att) => {
                      const tech = technicians.find((t) => t.id === att.technicianId);
                      return (
                        <div key={att.technicianId} className="rounded-lg border-2 border-status-change-request/30 bg-status-change-request/5 p-3 space-y-2">
                          <p className="text-sm font-medium">
                            {tech?.name} foreslår nytt tidspunkt
                          </p>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleAcceptProposal(att.technicianId)} className="gap-1.5">
                              Godta
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleDeclineProposal(att.technicianId)} className="gap-1.5">
                              Avvis
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {job.description && (
                <div className="rounded-lg bg-secondary p-3">
                  <p className="text-sm">{job.description}</p>
                </div>
              )}

              {/* Attachment list with details */}
              {job.attachments && job.attachments.length > 0 && (
                <AttachmentList attachments={job.attachments} />
              )}

              <div className="pt-4 border-t">
                <Button variant="destructive" size="sm" onClick={handleCancel}>
                  Avlys jobb
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="ghost" onClick={() => setMode("view")} className="h-7 w-7">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <SheetTitle>Rediger jobb</SheetTitle>
              </div>
            </SheetHeader>

            <form onSubmit={handleSave} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="edit-title">Tittel</Label>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">SERVICE –</span>
                  <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-customer">Kunde</Label>
                <Input id="edit-customer" value={customer} onChange={(e) => setCustomer(e.target.value)} required className="mt-1" />
              </div>

              <TechnicianMultiSelect selectedIds={techIds} onChange={setTechIds} />

              <div>
                <Label htmlFor="edit-address">Adresse</Label>
                <Input id="edit-address" value={address} onChange={(e) => setAddress(e.target.value)} required className="mt-1" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start</Label>
                  <div className="flex gap-2 mt-1">
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                    <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className="w-28" />
                  </div>
                </div>
                <div>
                  <Label>Slutt</Label>
                  <div className="flex gap-2 mt-1">
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                    <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required className="w-28" />
                  </div>
                </div>
              </div>

              {/* Conflict warning */}
              <ConflictWarning conflicts={editConflicts} />

              <div>
                <Label htmlFor="edit-description">Beskrivelse</Label>
                <Textarea id="edit-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1" />
              </div>

              <FileUpload
                files={files}
                onChange={setFiles}
                existingAttachments={existingAttachments}
                onRemoveExisting={handleRemoveExisting}
              />

              <div className="flex gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setMode("view")}>
                  Avbryt
                </Button>
                <Button type="submit" disabled={techIds.length === 0}>
                  Lagre endringer
                </Button>
              </div>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
