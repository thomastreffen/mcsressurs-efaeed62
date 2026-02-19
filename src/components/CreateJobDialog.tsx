import { useState, useMemo, Component, type ReactNode, type ErrorInfo } from "react";
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
import { ConflictWarning } from "./ConflictWarning";
import { getConflicts } from "@/lib/mock-data";
import { toast } from "sonner";

interface CreateJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedTechId?: string;
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

function CreateJobDialogInner({
  open,
  onOpenChange,
  preselectedTechId,
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

  const conflicts = useMemo(() => {
    const ids = Array.isArray(techIds) ? techIds : [];
    if (!startDate || !startTime || !endDate || !endTime || ids.length === 0) return [];
    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(`${endDate}T${endTime}`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
    return getConflicts(ids, start, end);
  }, [techIds, startDate, startTime, endDate, endTime]);

  const safeTechIds = Array.isArray(techIds) ? techIds : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (safeTechIds.length === 0) return;

    toast.success("Jobb opprettet", {
      description: `SERVICE – ${title} er lagt til for ${safeTechIds.length} montør(er).`,
    });
    onOpenChange(false);
    resetForm();
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

          <ConflictWarning conflicts={conflicts} />

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
            <Button type="submit" disabled={safeTechIds.length === 0}>
              Opprett jobb
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
