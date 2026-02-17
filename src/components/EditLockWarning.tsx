import { AlertTriangle } from "lucide-react";

interface EditLockWarningProps {
  editingByName: string;
  editingStartedAt: Date;
}

export function EditLockWarning({ editingByName, editingStartedAt }: EditLockWarningProps) {
  const minutesAgo = Math.round(
    (Date.now() - editingStartedAt.getTime()) / 60000
  );
  const isExpired = minutesAgo >= 10;

  if (isExpired) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-status-pending/30 bg-status-pending/5 p-3">
      <AlertTriangle className="h-4 w-4 text-status-pending mt-0.5 shrink-0" />
      <div className="text-sm">
        <p className="font-medium">Denne jobben redigeres nå av {editingByName}</p>
        <p className="text-muted-foreground text-xs mt-0.5">
          Startet for {minutesAgo} minutt{minutesAgo !== 1 ? "er" : ""} siden.
          Du kan fortsatt redigere, men endringer kan overskrives.
        </p>
      </div>
    </div>
  );
}
