import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  History, Mail, CalendarDays, Phone, FileText,
  ArrowRightLeft, StickyNote, CheckSquare
} from "lucide-react";

export interface ActivityEntry {
  id: string;
  type: string;
  action: string;
  title: string | null;
  description: string | null;
  created_at: string;
  performer_name?: string;
  microsoft_event_id?: string | null;
  microsoft_message_id?: string | null;
  visibility?: string;
  metadata?: Record<string, any>;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="h-4 w-4 text-primary" />,
  meeting: <CalendarDays className="h-4 w-4 text-status-scheduled" />,
  call: <Phone className="h-4 w-4 text-status-approved" />,
  note: <StickyNote className="h-4 w-4 text-muted-foreground" />,
  task: <CheckSquare className="h-4 w-4 text-status-in-progress" />,
  document: <FileText className="h-4 w-4 text-status-requested" />,
  status_change: <ArrowRightLeft className="h-4 w-4 text-status-time-change-proposed" />,
};

interface ActivityTimelineProps {
  activities: ActivityEntry[];
  emptyMessage?: string;
  /** Filter to specific types */
  filterTypes?: string[];
}

export function ActivityTimeline({ activities, emptyMessage, filterTypes }: ActivityTimelineProps) {
  const filtered = filterTypes
    ? activities.filter(a => filterTypes.includes(a.type))
    : activities;

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        {emptyMessage || "Ingen aktiviteter"}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {filtered.map(a => (
        <div key={a.id} className="flex gap-3 text-sm">
          <div className="pt-1 shrink-0">
            {TYPE_ICONS[a.type] || <History className="h-4 w-4 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            {a.title && a.title !== a.description && (
              <p className="font-medium text-foreground">{a.title}</p>
            )}
            <p className="text-foreground">{a.description}</p>
            <p className="text-xs text-muted-foreground">
              {a.performer_name || "System"} · {format(new Date(a.created_at), "d. MMM yyyy HH:mm", { locale: nb })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
