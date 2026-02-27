import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import { Check, X, Ban, Copy, Mail } from "lucide-react";
import {
  CLOSE_RESOLUTION_TYPES,
  CASE_RESOLUTION_LABELS,
  type CaseResolutionType,
} from "@/lib/case-labels";

const RESOLUTION_ICONS: Record<string, React.ReactNode> = {
  resolved_email_only: <Mail className="h-4 w-4" />,
  rejected: <X className="h-4 w-4" />,
  spam: <Ban className="h-4 w-4" />,
  duplicate: <Copy className="h-4 w-4" />,
};

interface CaseCloseDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (resolutionType: CaseResolutionType) => void;
}

export function CaseCloseDrawer({ open, onOpenChange, onConfirm }: CaseCloseDrawerProps) {
  const [selected, setSelected] = useState<CaseResolutionType | null>(null);

  const handleConfirm = () => {
    if (!selected) return;
    onConfirm(selected);
    onOpenChange(false);
    setSelected(null);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Lukk sak</DrawerTitle>
          <DrawerDescription>Velg årsak for lukking</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4 grid grid-cols-2 gap-2">
          {CLOSE_RESOLUTION_TYPES.map((rt) => (
            <button
              key={rt}
              onClick={() => setSelected(rt)}
              className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-all ${
                selected === rt
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-primary/40 hover:bg-secondary/50"
              }`}
            >
              <span className="text-muted-foreground">{RESOLUTION_ICONS[rt]}</span>
              <span className="font-medium">{CASE_RESOLUTION_LABELS[rt]}</span>
            </button>
          ))}
        </div>
        <DrawerFooter className="flex-row gap-2">
          <DrawerClose asChild>
            <Button variant="outline" className="flex-1">Avbryt</Button>
          </DrawerClose>
          <Button onClick={handleConfirm} disabled={!selected} className="flex-1 gap-1.5">
            <Check className="h-4 w-4" />
            Lukk sak
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
