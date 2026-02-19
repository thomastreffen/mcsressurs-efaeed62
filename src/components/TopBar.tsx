import { Button } from "@/components/ui/button";
import { Plus, Wrench, ShieldCheck, LogOut, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useActionRequired } from "@/hooks/useActionRequired";
import { cn } from "@/lib/utils";

interface TopBarProps {
  onNewJob: () => void;
}

export function TopBar({ onNewJob }: TopBarProps) {
  const navigate = useNavigate();
  const { user, isSuperAdmin, signOut } = useAuth();
  const actionCount = useActionRequired();

  return (
    <header className="flex items-center justify-between border-b bg-card px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wrench className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-base font-semibold leading-tight">
            MCS Service
          </h1>
          <p className="text-xs text-muted-foreground">Ressursplanlegger</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {actionCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-status-time-change-proposed/15 px-3 py-1.5 text-xs font-medium text-status-time-change-proposed">
            <Bell className="h-3.5 w-3.5" />
            {actionCount} handling{actionCount !== 1 ? "er" : ""} krever oppmerksomhet
          </div>
        )}
        {user && (
          <span className="text-sm text-muted-foreground mr-2">
            {user.name}
          </span>
        )}
        {isSuperAdmin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/users")}
            className="gap-1.5"
          >
            <ShieldCheck className="h-4 w-4" />
            Brukere
          </Button>
        )}
        <Button onClick={onNewJob} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Ny jobb
        </Button>
        <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5">
          <LogOut className="h-4 w-4" />
          Logg ut
        </Button>
      </div>
    </header>
  );
}
