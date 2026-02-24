import { NotificationDrawer } from "@/components/NotificationDrawer";
import { useNotifications } from "@/hooks/useNotifications";

export default function NotificationsPage() {
  const { notifications, markAsRead, markAllAsRead } = useNotifications();

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">Varsler</h1>
        {notifications.some((n) => !n.read) && (
          <button
            onClick={markAllAsRead}
            className="text-sm text-primary hover:underline"
          >
            Merk alle som lest
          </button>
        )}
      </div>

      <div className="space-y-2">
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Ingen varsler.</p>
        ) : (
          notifications.map((n) => (
            <a
              key={n.id}
              href={n.event_id ? `/projects/${n.event_id}` : "#"}
              onClick={() => !n.read && markAsRead(n.id)}
              className={`block rounded-lg border p-3 transition-colors hover:bg-secondary/50 ${
                !n.read ? "border-primary/20 bg-primary/5" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.message && <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>}
                </div>
                {!n.read && <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {new Date(n.created_at).toLocaleString("nb-NO")}
              </p>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
