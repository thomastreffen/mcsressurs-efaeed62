import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Copy, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export interface EntityTab {
  value: string;
  label: string;
  count?: number;
  content: ReactNode;
}

export interface EntityAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  mobileLabel?: string;
  /** Hide on mobile if false */
  showOnMobile?: boolean;
}

export interface EntityViewProps {
  /** Main display name */
  name: string;
  /** Reference code (e.g. LEAD-2026-000001) */
  refCode?: string | null;
  /** Subtitle line below name */
  subtitle?: string;
  /** Status badge */
  statusBadge?: ReactNode;
  /** Action buttons in header */
  actions?: EntityAction[];
  /** Banner shown above content (e.g. overdue warning, re-auth) */
  banner?: ReactNode;
  /** Tabs */
  tabs: EntityTab[];
  /** Default active tab */
  defaultTab?: string;
  /** Back button handler */
  onBack: () => void;
  /** Loading state */
  loading?: boolean;
  /** Not found state */
  notFound?: boolean;
  notFoundMessage?: string;
  /** Optional right side panel content (future) */
  sidePanel?: ReactNode;
}

export function EntityView({
  name,
  refCode,
  subtitle,
  statusBadge,
  actions = [],
  banner,
  tabs,
  defaultTab,
  onBack,
  loading,
  notFound,
  notFoundMessage,
  sidePanel,
}: EntityViewProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-md p-8 text-center space-y-4">
        <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground opacity-60" />
        <h2 className="text-lg font-semibold">{notFoundMessage || "Ikke funnet"}</h2>
        <p className="text-sm text-muted-foreground">
          Du har ikke tilgang, eller elementet finnes ikke.
        </p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbake
        </Button>
      </div>
    );
  }

  const copyRefCode = () => {
    if (refCode) {
      navigator.clipboard.writeText(refCode);
      toast.success("Referansekode kopiert");
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-7">
      {/* Banner */}
      {banner}

      {/* Header with subtle tint */}
      <div className="flex items-start gap-3 rounded-2xl bg-gradient-to-r from-primary/[0.04] to-transparent p-4 -mx-1">
        <Button variant="ghost" size="icon" onClick={onBack} className="mt-1 rounded-xl">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{name}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {refCode && (
              <button
                onClick={copyRefCode}
                className="inline-flex items-center gap-1 text-xs font-mono bg-card border border-border/60 px-2 py-0.5 rounded-lg hover:bg-accent/50 transition-colors shadow-sm"
                title="Klikk for å kopiere"
              >
                {refCode}
                <Copy className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
            {subtitle && (
              <span className="text-sm text-muted-foreground">{subtitle}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions.filter(a => a.showOnMobile !== false).map((action, i) => (
            <Button
              key={i}
              variant="outline"
              size="sm"
              className="gap-1.5 hidden sm:flex"
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : action.icon}
              {action.label}
            </Button>
          ))}
          {statusBadge}
        </div>
      </div>

      {/* Mobile action buttons */}
      {actions.length > 0 && (
        <div className="flex gap-2 sm:hidden">
          {actions.filter(a => a.showOnMobile !== false).map((action, i) => (
            <Button
              key={i}
              variant="outline"
              size="sm"
              className="gap-1.5 flex-1"
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : action.icon}
              {action.mobileLabel || action.label}
            </Button>
          ))}
        </div>
      )}

      {/* Main content with optional side panel */}
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <Tabs defaultValue={defaultTab || tabs[0]?.value} className="space-y-4">
            <TabsList className="flex-wrap">
              {tabs.map(tab => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ""}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map(tab => (
              <TabsContent key={tab.value} value={tab.value} className="space-y-4">
                {tab.content}
              </TabsContent>
            ))}
          </Tabs>
        </div>

        {/* Right side panel placeholder */}
        {sidePanel && (
          <div className="hidden lg:block w-80 shrink-0">
            {sidePanel}
          </div>
        )}
      </div>
    </div>
  );
}
