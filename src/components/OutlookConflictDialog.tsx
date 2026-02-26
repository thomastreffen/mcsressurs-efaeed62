import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Monitor, Cloud } from "lucide-react";
import type { GraphConflict } from "@/hooks/useCalendarSync";

interface OutlookConflictDialogProps {
  conflict: GraphConflict | null;
  onUseSystem: () => void;
  onUseOutlook: () => void;
  onDismiss: () => void;
}

export function OutlookConflictDialog({
  conflict,
  onUseSystem,
  onUseOutlook,
  onDismiss,
}: OutlookConflictDialogProps) {
  if (!conflict) return null;

  const gv = conflict.graphVersion;

  return (
    <AlertDialog open={!!conflict} onOpenChange={(o) => { if (!o) onDismiss(); }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Outlook-konflikt
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>Hendelsen har blitt endret direkte i Outlook. Velg hvilken versjon du vil beholde:</p>
            {gv && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm space-y-1 mt-2">
                <p className="font-medium">Outlook-versjon:</p>
                {gv.subject && <p>Tittel: {gv.subject}</p>}
                {gv.start && <p>Start: {new Date(gv.start).toLocaleString("nb-NO")}</p>}
                {gv.end && <p>Slutt: {new Date(gv.end).toLocaleString("nb-NO")}</p>}
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onDismiss} className="gap-1.5">
            Avbryt
          </Button>
          <Button variant="secondary" onClick={onUseOutlook} className="gap-1.5">
            <Cloud className="h-4 w-4" />
            Bruk Outlook-tid
          </Button>
          <Button onClick={onUseSystem} className="gap-1.5">
            <Monitor className="h-4 w-4" />
            Bruk systemtid
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
