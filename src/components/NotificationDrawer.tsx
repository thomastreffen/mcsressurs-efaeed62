import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { Bell, CheckCheck, Clock, AlertTriangle, XCircle, CalendarCheck, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Notification } from "@/hooks/useNotifications";
import type { JobStatus } from "@/lib/job-status";

interface NotificationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  time_change_proposed: Clock,
  approval_pending: CalendarCheck,
  rejected: XCircle,
  conflict: AlertTriangle,
  ms_connect_request: Plug,
};

const TYPE_STATUS_MAP: Record<string, JobStatus> = {
  time_change_proposed: "time_change_proposed",
  approval_pending: "requested",
  rejected: "rejected",
};

export function NotificationDrawer({
  open,
  onOpenChange,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
}: NotificationDrawerProps) {
  const navigate = useNavigate();
  const unread = notifications.filter((n) => !n.read);

  const handleClick = (notification: Notification) => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
    }
    if (notification.type === "ms_connect_request") {
      navigate("/settings/integrations");
      onOpenChange(false);
      return;
    }
    if (notification.event_id) {
      navigate(`/jobs/${notification.event_id}`);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Varsler
          </SheetTitle>
          <SheetDescription className="sr-only">Varslinger og handlinger som krever oppmerksomhet</SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {unread.length > 0
              ? `${unread.length} ulest${unread.length !== 1 ? "e" : ""}`
              : "Ingen uleste varsler"}
          </p>
          {unread.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onMarkAllAsRead} className="gap-1.5 text-xs">
              <CheckCheck className="h-3.5 w-3.5" />
              Merk alle som lest
            </Button>
          )}
        </div>

        <ScrollArea className="mt-3 h-[calc(100vh-160px)]">
          <div className="space-y-1 pr-4">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Ingen varsler ennå</p>
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = TYPE_ICONS[n.type] || Bell;
                const statusForBadge = TYPE_STATUS_MAP[n.type];

                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition-colors",
                      !n.read
                        ? "bg-accent/50 border-accent-foreground/10"
                        : "bg-card hover:bg-secondary/50 border-transparent"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          !n.read ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={cn("text-sm truncate", !n.read && "font-medium")}>
                            {n.title}
                          </p>
                          {!n.read && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                        {n.message && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {n.message}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          {statusForBadge && <JobStatusBadge status={statusForBadge} />}
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(n.created_at), "d. MMM HH:mm", { locale: nb })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
