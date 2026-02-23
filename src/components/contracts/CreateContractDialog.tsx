import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateContract } from "@/hooks/useContracts";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Loader2 } from "lucide-react";

interface CreateContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultLeadId?: string;
  defaultJobId?: string;
}

export function CreateContractDialog({ open, onOpenChange, defaultLeadId, defaultJobId }: CreateContractDialogProps) {
  const [title, setTitle] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [contractType, setContractType] = useState("");
  const { activeCompanyId } = useCompanyContext();
  const createContract = useCreateContract();

  const handleSubmit = async () => {
    if (!title.trim() || !activeCompanyId) return;
    await createContract.mutateAsync({
      title: title.trim(),
      company_id: activeCompanyId,
      counterparty_name: counterparty || undefined,
      contract_type: contractType || undefined,
      lead_id: defaultLeadId,
      job_id: defaultJobId,
    });
    setTitle("");
    setCounterparty("");
    setContractType("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ny kontrakt</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="title">Tittel *</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kontraktstittel" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="counterparty">Motpart</Label>
            <Input id="counterparty" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Motpartens navn" />
          </div>
          <div className="space-y-2">
            <Label>Kontraktstype</Label>
            <Select value={contractType} onValueChange={setContractType}>
              <SelectTrigger>
                <SelectValue placeholder="Velg type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NS8405">NS 8405</SelectItem>
                <SelectItem value="NS8406">NS 8406</SelectItem>
                <SelectItem value="NS8407">NS 8407</SelectItem>
                <SelectItem value="totalentreprise">Totalentreprise</SelectItem>
                <SelectItem value="underentreprise">Underentreprise</SelectItem>
                <SelectItem value="annet">Annet</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || createContract.isPending}>
            {createContract.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Opprett
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
