import { UserCheck, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { Button } from "@/components/ui/button";

interface CaseAssignmentBannerProps {
  assignedName: string;
  assignedAt: string;
  isCurrentUser: boolean;
  onUnassign?: () => void;
}

export function CaseAssignmentBanner({ assignedName, assignedAt, isCurrentUser, onUnassign }: CaseAssignmentBannerProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <UserCheck className="h-4 w-4 text-primary shrink-0" />
      <div className="text-sm flex-1 min-w-0">
        <span className="font-medium">
          {isCurrentUser ? "Du" : assignedName} jobber med denne
        </span>
        <span className="text-muted-foreground ml-1.5">
          (siden {formatDistanceToNow(new Date(assignedAt), { locale: nb, addSuffix: true })})
        </span>
      </div>
      {onUnassign && (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onUnassign}>
          <X className="h-3 w-3 mr-1" />
          Frigjør
        </Button>
      )}
    </div>
  );
}
