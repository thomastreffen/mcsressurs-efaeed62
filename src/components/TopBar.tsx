import { Button } from "@/components/ui/button";
import { Plus, Wrench, ShieldCheck, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface TopBarProps {
  onNewJob: () => void;
}

export function TopBar({ onNewJob }: TopBarProps) {
  const navigate = useNavigate();
  const { user, isSuperAdmin, signOut } = useAuth();

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
