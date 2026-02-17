import { Button } from "@/components/ui/button";
import { Plus, Wrench } from "lucide-react";

interface TopBarProps {
  onNewJob: () => void;
}

export function TopBar({ onNewJob }: TopBarProps) {
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
      <Button onClick={onNewJob} size="sm" className="gap-1.5">
        <Plus className="h-4 w-4" />
        Ny jobb
      </Button>
    </header>
  );
}
