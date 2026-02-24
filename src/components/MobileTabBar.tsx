import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  Plus,
  CalendarDays,
  Bell,
  Briefcase,
  Users,
  FileText,
  ScrollText,
} from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { useActionRequired } from "@/hooks/useActionRequired";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";

const quickActions = [
  {
    label: "Ny jobb",
    description: "Opprett en ny jobbordre",
    icon: Briefcase,
    path: "/projects/new",
    permission: null,
  },
  {
    label: "Ny lead",
    description: "Registrer et nytt salgsmulighet",
    icon: Users,
    path: "/leads?new=1",
    permission: "sales.create",
  },
  {
    label: "Nytt tilbud",
    description: "Lag et nytt kundetilbud",
    icon: FileText,
    path: "/offers/new",
    permission: "offers.create",
  },
  {
    label: "Ny kontrakt",
    description: "Opprett en ny kontrakt",
    icon: ScrollText,
    path: "/contracts?new=1",
    permission: "contracts.create",
  },
];

export function MobileTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { unreadCount } = useNotifications();
  const actionRequiredCount = useActionRequired();
  const [fabOpen, setFabOpen] = useState(false);

  const jobsDot = actionRequiredCount > 0;

  const availableActions = quickActions.filter((action) => {
    if (!action.permission) return true;
    if (user?.role === "super_admin" || user?.role === "admin") return true;
    return hasPermission(action.permission);
  });

  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(path);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card lg:hidden safe-area-bottom">
        <div className="flex items-stretch">
          <TabButton
            label="Oversikt"
            icon={LayoutDashboard}
            active={isActive("/overview")}
            onClick={() => navigate("/overview")}
          />

          {/* Prosjekter */}
          <TabButton
            label="Prosjekter"
            icon={FolderKanban}
            active={isActive("/projects")}
            onClick={() => navigate("/projects")}
            dot={jobsDot}
          />

          {/* FAB center */}
          <button
            onClick={() => setFabOpen(true)}
            className="flex flex-1 items-center justify-center py-1"
            aria-label="Ny handling"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 -mt-4 transition-transform active:scale-95">
              <Plus className="h-6 w-6" strokeWidth={2.5} />
            </span>
          </button>

          {/* Plan */}
          <TabButton
            label="Plan"
            icon={CalendarDays}
            active={isActive("/projects/plan")}
            onClick={() => navigate("/projects/plan")}
          />

          {/* Varsler */}
          <TabButton
            label="Varsler"
            icon={Bell}
            active={isActive("/notifications")}
            onClick={() => navigate("/notifications")}
            badge={unreadCount}
          />
        </div>
      </nav>

      {/* Quick-action Drawer */}
      <Drawer open={fabOpen} onOpenChange={setFabOpen}>
        <DrawerContent>
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-base">Ny handling</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            {availableActions.map((action) => (
              <DrawerClose key={action.label} asChild>
                <button
                  onClick={() => {
                    setFabOpen(false);
                    navigate(action.path);
                  }}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-secondary active:bg-secondary/80"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <action.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{action.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{action.description}</p>
                  </div>
                </button>
              </DrawerClose>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/* ─── Tab Button sub-component ─── */
function TabButton({
  label,
  icon: Icon,
  active,
  onClick,
  badge,
  dot,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  badge?: number;
  dot?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors relative min-h-[48px] active:bg-secondary/50",
        active ? "text-primary" : "text-muted-foreground"
      )}
    >
      <div className="relative">
        <Icon className="h-5 w-5" />
        {(badge ?? 0) > 0 && (
          <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
            {(badge ?? 0) > 9 ? "9+" : badge}
          </span>
        )}
        {dot && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent" />
        )}
      </div>
      {label}
    </button>
  );
}
