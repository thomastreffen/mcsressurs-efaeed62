import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TechnicianMultiSelect } from "./TechnicianMultiSelect";
import { FileUpload } from "./FileUpload";
import { type Job } from "@/lib/mock-data";
import { format } from "date-fns";
import { toast } from "sonner";

interface EditJobDialogProps {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditJobDialog({ job, open, onOpenChange }: EditJobDialogProps) {
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
  const [existingAttachments, setExistingAttachments] = useState<{ name: string; url: string }[]>([]);

  useEffect(() => {
    if (job) {
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
    }
  }, [job]);

  if (!job) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (techIds.length === 0) return;

    toast.success("Jobb oppdatert", {
      description: `SERVICE – ${title} er lagret.`,
    });
    onOpenChange(false);
  };

  const handleRemoveExisting = (name: string) => {
    setExistingAttachments((prev) => prev.filter((a) => a.name !== name));
    toast.info(`Vedlegg "${name}" fjernet`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rediger jobb</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="edit-title">Tittel</Label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                SERVICE –
              </span>
              <Input
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="edit-customer">Kunde</Label>
            <Input
              id="edit-customer"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              required
              className="mt-1"
            />
          </div>

          <TechnicianMultiSelect selectedIds={techIds} onChange={setTechIds} />

          <div>
            <Label htmlFor="edit-address">Adresse</Label>
            <Input
              id="edit-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
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
                  onChange={(e) => setStartDate(e.target.value)}
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

          <div>
            <Label htmlFor="edit-description">Beskrivelse</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>

          <FileUpload
            files={files}
            onChange={setFiles}
            existingAttachments={existingAttachments}
            onRemoveExisting={handleRemoveExisting}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={techIds.length === 0}>
              Lagre endringer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
