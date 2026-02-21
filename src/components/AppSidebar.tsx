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
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Integrasjoner", url: "/settings/integrations", icon: Plug },
];

const salesNav = [
  { title: "Salgsdashboard", url: "/sales", icon: BarChart3 },
  { title: "Pipeline", url: "/sales/pipeline", icon: TrendingUp },
  { title: "Leads", url: "/sales/leads", icon: UserPlus },
  { title: "Kalkulasjoner", url: "/sales/calculations", icon: Calculator },
  { title: "Tilbudsoversikt", url: "/sales/offers", icon: ReceiptText },
];

const projectNav = [
  { title: "Alle jobber", url: "/jobs", icon: FolderKanban },
  { title: "Ressursplan", url: "/resource-plan", icon: CalendarDays },
];

const fagNav = [
  { title: "Fag", url: "/fag", icon: BookOpen },
  { title: "Fag-innsikt", url: "/admin/fag-insights", icon: BarChart3, requireAdmin: true },
];

const adminNav = [
  { title: "Firma", url: "/admin/company", icon: Building, requireSuperAdmin: true },
  { title: "Brukere", url: "/admin/users", icon: Users, requireSuperAdmin: true },
  { title: "Tilgangsstyring", url: "/admin/access", icon: ShieldCheck, requireSuperAdmin: true },
  { title: "Integrasjonshelse", url: "/admin/integration-health", icon: HeartPulse, requireAdmin: true },
  { title: "Systemhelse", url: "/admin/system-health", icon: Activity, requireAdmin: true },
  { title: "Dataintegritet", url: "/admin/data-integrity", icon: DatabaseZap, requireAdmin: true },
  { title: "Innstillinger", url: "/admin/settings", icon: Settings, requireAdmin: true },
  { title: "Papirkurv", url: "/admin/trash", icon: Trash2, requireAdmin: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { isAdmin, isSuperAdmin } = useAuth();
  const location = useLocation();

  const isActive = (url: string) =>
    url === "/" ? location.pathname === "/" : location.pathname.startsWith(url);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <Wrench className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-sm font-semibold leading-tight text-white">MCS Service</h1>
              <p className="text-[11px] text-white/60">Salg & Prosjekt</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Main */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title} className={isActive(item.url) ? "border-l-[3px] border-l-orange-400 rounded-l-none" : ""}>
                    <NavLink to={item.url} end={item.url === "/"}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Sales */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Salg</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {salesNav.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title} className={isActive(item.url) ? "border-l-[3px] border-l-orange-400 rounded-l-none" : ""}>
                      <NavLink to={item.url} end={item.url === "/sales"}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Projects */}
        <SidebarGroup>
          <SidebarGroupLabel>Prosjekter</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projectNav.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title} className={isActive(item.url) ? "border-l-[3px] border-l-orange-400 rounded-l-none" : ""}>
                    <NavLink to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Fag */}
        <SidebarGroup>
          <SidebarGroupLabel>Fag & Forskrift</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {fagNav
                .filter((item) => !item.requireAdmin || isAdmin)
                .map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title} className={isActive(item.url) ? "border-l-[3px] border-l-orange-400 rounded-l-none" : ""}>
                    <NavLink to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administrasjon</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNav
                  .filter((item) => {
                    if (item.requireSuperAdmin) return isSuperAdmin;
                    if (item.requireAdmin) return isAdmin;
                    return true;
                  })
                  .map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title} className={isActive(item.url) ? "border-l-[3px] border-l-orange-400 rounded-l-none" : ""}>
                        <NavLink to={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
