import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { type EventLog } from "@/lib/mock-data";
import { FileText, PenLine, XCircle, UserPlus, UserMinus, ArrowRightLeft } from "lucide-react";

const actionIcons: Record<EventLog["actionType"], React.ReactNode> = {
  created: <FileText className="h-3.5 w-3.5 text-status-approved" />,
  updated: <PenLine className="h-3.5 w-3.5 text-status-requested" />,
  cancelled: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  attendee_added: <UserPlus className="h-3.5 w-3.5 text-primary" />,
  attendee_removed: <UserMinus className="h-3.5 w-3.5 text-muted-foreground" />,
  status_changed: <ArrowRightLeft className="h-3.5 w-3.5 text-status-scheduled" />,
};

interface EventLogListProps {
  logs: EventLog[];
}

export function EventLogList({ logs }: EventLogListProps) {
  if (logs.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Endringshistorikk
      </p>
      <div className="space-y-1.5">
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-2 text-xs">
            <div className="mt-0.5 shrink-0">{actionIcons[log.actionType]}</div>
            <div className="flex-1 min-w-0">
              <p className="text-foreground">{log.changeSummary}</p>
              <p className="text-muted-foreground">
                {log.performedByName} · {format(log.timestamp, "d. MMM yyyy HH:mm", { locale: nb })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
