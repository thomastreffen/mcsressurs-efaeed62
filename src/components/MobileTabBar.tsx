import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, FolderKanban, CalendarDays, Bell } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Jobber", path: "/jobs", icon: FolderKanban },
  { label: "Plan", path: "/resource-plan", icon: CalendarDays },
  { label: "Varsler", path: "/notifications", icon: Bell },
];

export function MobileTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card lg:hidden safe-area-bottom">
      <div className="flex items-stretch">
        {tabs.map((tab) => {
          const isActive =
            tab.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(tab.path);

          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors relative",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <tab.icon className="h-5 w-5" />
                {tab.path === "/notifications" && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </div>
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
