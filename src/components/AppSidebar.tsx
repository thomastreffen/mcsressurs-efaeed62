import { useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  CalendarDays,
  Calculator,
  Users,
  Settings,
  Wrench,
  ReceiptText,
  TrendingUp,
  UserPlus,
  BarChart3,
  Building,
  Trash2,
  ShieldCheck,
  Plug,
  HeartPulse,
  BookOpen,
  Activity,
  DatabaseZap,
  FileSignature,
  Timer,
  HardHat,
  Upload,
  Inbox,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const mainNav = [
  { title: "Oversikt", url: "/overview", icon: LayoutDashboard },
  { title: "Henvendelser", url: "/inbox", icon: Inbox },
  { title: "Integrasjoner", url: "/settings/integrations", icon: Plug },
];

const customerNav = [
  { title: "Alle kunder", url: "/customers", icon: Users },
  { title: "Import", url: "/customers/import", icon: Upload },
];

const salesNav = [
  { title: "Sales Pulse", url: "/sales", icon: BarChart3 },
  { title: "Pipeline", url: "/sales/pipeline", icon: TrendingUp },
  { title: "Leads", url: "/sales/leads", icon: UserPlus },
  { title: "Tilbud", url: "/sales/offers", icon: ReceiptText },
];

const projectNav = [
  { title: "Alle prosjekter", url: "/projects", icon: FolderKanban },
  { title: "Ressursplan", url: "/projects/plan", icon: CalendarDays },
  { title: "Kontrakter", url: "/projects/contracts", icon: FileSignature },
];

const fagNav = [
  { title: "Fag", url: "/fag", icon: BookOpen },
  { title: "Fag-innsikt", url: "/admin/fag-insights", icon: BarChart3, requireAdmin: true },
];

const adminNav = [
  { title: "Firma", url: "/admin/company", icon: Building, requireSuperAdmin: true },
  { title: "Ansatte", url: "/admin/ansatte", icon: HardHat, requireAdmin: true },
  { title: "Postkontoret", url: "/admin/superoffice", icon: Inbox, requireAdmin: true },
  { title: "Skjemamaler", url: "/admin/forms", icon: BookOpen, requireAdmin: true },
  { title: "Brukere", url: "/admin/users", icon: Users, requireSuperAdmin: true },
  { title: "Tilgangsstyring", url: "/admin/access", icon: ShieldCheck, requireSuperAdmin: true },
  { title: "Integrasjonshelse", url: "/admin/integration-health", icon: HeartPulse, requireAdmin: true },
  { title: "Systemhelse", url: "/admin/system-health", icon: Activity, requireAdmin: true },
  { title: "Dataintegritet", url: "/admin/data-integrity", icon: DatabaseZap, requireAdmin: true },
  { title: "Kontraktvarsler", url: "/admin/contract-cron", icon: Timer, requireAdmin: true },
  { title: "Innstillinger", url: "/admin/settings", icon: Settings, requireAdmin: true },
  { title: "Papirkurv", url: "/admin/trash", icon: Trash2, requireAdmin: true },
];

function NavGroup({ label, items, isActive, collapsed }: {
  label?: string;
  items: { title: string; url: string; icon: React.ElementType }[];
  isActive: (url: string) => boolean;
  collapsed: boolean;
}) {
  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActive(item.url);
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.title}
                  className={active ? "border-l-[3px] border-l-accent rounded-l-none bg-sidebar-accent/60" : ""}
                >
                  <NavLink to={item.url} end={item.url === "/overview" || item.url === "/sales"}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { isAdmin, isSuperAdmin } = useAuth();
  const location = useLocation();

  const isActive = (url: string) =>
    url === "/overview" ? location.pathname === "/overview" : location.pathname.startsWith(url);

  const filteredAdmin = adminNav.filter((item) => {
    if ('requireSuperAdmin' in item && item.requireSuperAdmin) return isSuperAdmin;
    if ('requireAdmin' in item && item.requireAdmin) return isAdmin;
    return true;
  });

  const filteredFag = fagNav.filter((item) => !('requireAdmin' in item && item.requireAdmin) || isAdmin);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Wrench className="h-4.5 w-4.5 text-white" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-sm font-bold leading-tight text-white tracking-tight">MCS Service</h1>
              <p className="text-[10px] text-white/50 mt-0.5">Salg & Prosjekt</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <NavGroup items={mainNav} isActive={isActive} collapsed={collapsed} />
        <NavGroup label="Kunder" items={customerNav} isActive={isActive} collapsed={collapsed} />
        {isAdmin && <NavGroup label="Salg" items={salesNav} isActive={isActive} collapsed={collapsed} />}
        <NavGroup label="Prosjekter" items={projectNav} isActive={isActive} collapsed={collapsed} />
        <NavGroup label="Fag & Forskrift" items={filteredFag} isActive={isActive} collapsed={collapsed} />
        {isAdmin && <NavGroup label="Administrasjon" items={filteredAdmin} isActive={isActive} collapsed={collapsed} />}
      </SidebarContent>
    </Sidebar>
  );
}
