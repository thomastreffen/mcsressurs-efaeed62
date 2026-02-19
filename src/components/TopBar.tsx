import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Wrench,
  ShieldCheck,
  LogOut,
  Bell,
  Menu,
  ChevronDown,
  ListTodo,
  AlertTriangle,
  History,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationDrawer } from "@/components/NotificationDrawer";
import { cn } from "@/lib/utils";

interface TopBarProps {
  onNewJob: () => void;
  onToggleSidebar?: () => void;
  showMenuButton?: boolean;
}

export function TopBar({ onNewJob, onToggleSidebar, showMenuButton }: TopBarProps) {
  const navigate = useNavigate();
  const { user, isSuperAdmin, isAdmin, signOut } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <header className="flex items-center justify-between border-b bg-card px-4 py-3 sm:px-6 sticky top-0 z-30">
        <div className="flex items-center gap-2 sm:gap-3">
          {showMenuButton && (
            <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="lg:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wrench className="h-4 w-4" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-base font-semibold leading-tight">MCS Service</h1>
            <p className="text-xs text-muted-foreground">Ressursplanlegger</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Notification bell */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDrawerOpen(true)}
            className="relative"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>

          {/* User name - hidden on mobile */}
          {user && (
            <span className="hidden sm:inline text-sm text-muted-foreground mr-1">
              {user.name}
            </span>
          )}

          {/* Admin dropdown */}
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 hidden sm:flex">
                  Administrasjon
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={onNewJob} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Ny jobb
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {isSuperAdmin && (
                  <DropdownMenuItem onClick={() => navigate("/admin/users")} className="gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    Brukere
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Mobile: just the plus button */}
          <Button onClick={onNewJob} size="icon" className="sm:hidden">
            <Plus className="h-4 w-4" />
          </Button>

          {/* Desktop: full button */}
          <Button onClick={onNewJob} size="sm" className="gap-1.5 hidden sm:flex">
            <Plus className="h-4 w-4" />
            Ny jobb
          </Button>

          <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logg ut</span>
          </Button>
        </div>
      </header>

      <NotificationDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        notifications={notifications}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
      />
    </>
  );
}
