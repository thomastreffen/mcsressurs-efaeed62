import {
  LayoutDashboard,
  CalendarCheck,
  ClipboardList,
  FileText,
  AlertTriangle,
  DollarSign,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "dash", label: "Dashboard", icon: LayoutDashboard },
  { key: "plan", label: "Plan", icon: CalendarCheck },
  { key: "skjemaer", label: "Skjemaer", icon: ClipboardList },
  { key: "dokumenter", label: "Dokumenter", icon: FileText },
  { key: "risiko", label: "Risiko", icon: AlertTriangle },
  { key: "okonomi", label: "Økonomi", icon: DollarSign },
  { key: "epost", label: "E-post", icon: Mail },
] as const;

interface ProjectSubnavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function ProjectSubnav({ activeTab, onTabChange }: ProjectSubnavProps) {
  return (
    <div className="sticky top-[57px] z-20 border-b border-border/60 bg-card/95 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <nav className="flex gap-0 overflow-x-auto -mb-px" aria-label="Prosjektmeny">
          {TABS.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => onTabChange(key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
