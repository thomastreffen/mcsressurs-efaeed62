import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface BulkDeleteBarProps {
  selectedIds: string[];
  entityType: "events" | "leads" | "offers" | "contracts";
  entityLabel: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function BulkDeleteBar({ selectedIds, entityType, entityLabel, onComplete, onCancel }: BulkDeleteBarProps) {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (selectedIds.length === 0) return null;

  const handleBulkDelete = async () => {
    setDeleting(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from(entityType)
      .update({ deleted_at: now, deleted_by: user?.id } as any)
      .in("id", selectedIds);

    if (error) {
      toast.error("Kunne ikke flytte til papirkurv");
    } else {
      toast.success(`${selectedIds.length} ${entityLabel} flyttet til papirkurv`);
      onComplete();
    }
    setDeleting(false);
    setDialogOpen(false);
  };

  return (
    <>
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5">
        <span className="text-sm font-medium">
          {selectedIds.length} {entityLabel} valgt
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} className="gap-1.5 h-8 text-xs">
            <X className="h-3.5 w-3.5" /> Avbryt
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5 h-8 text-xs">
            <Trash2 className="h-3.5 w-3.5" /> Flytt til papirkurv
          </Button>
        </div>
      </div>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Flytte {selectedIds.length} elementer til papirkurv?</AlertDialogTitle>
            <AlertDialogDescription>
              Elementene kan gjenopprettes senere fra papirkurven.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5">
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Flytt til papirkurv
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
