import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Clock,
  Plus,
  CalendarCheck,
  MoreHorizontal,
  Copy,
  ExternalLink,
  ClipboardList,
  FileText,
  Mail,
  AlertTriangle,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { JobStatus } from "@/lib/job-status";
import { getDisplayNumber } from "@/lib/job-status";

interface ProjectHeaderProps {
  jobNumber: string | null;
  internalNumber: string | null;
  title: string;
  customer: string;
  address: string;
  start: Date;
  end: Date;
  status: JobStatus;
  technicianNames: string[];
  projectType?: string;
  onNavigateTab: (tab: string) => void;
}

export function ProjectHeader({
  jobNumber,
  internalNumber,
  title,
  customer,
  address,
  start,
  end,
  status,
  technicianNames,
  projectType,
  onNavigateTab,
}: ProjectHeaderProps) {
  const navigate = useNavigate();
  const displayNumber = getDisplayNumber(jobNumber, internalNumber);

  const period = `${format(start, "d. MMM", { locale: nb })} – ${format(end, "d. MMM yyyy", { locale: nb })}`;

  return (
    <div className="sticky top-0 z-30 border-b border-border/60 bg-card/95 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3">
        <div className="flex items-start justify-between gap-3">
          {/* Left: back + info */}
          <div className="flex items-start gap-2.5 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/projects")}
              className="shrink-0 mt-0.5 rounded-xl h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              {/* Title row */}
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold tracking-tight truncate">
                  {displayNumber} – {title}
                </h1>
                <JobStatusBadge status={status} />
              </div>
              {/* Sub-line */}
              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {customer || "Ingen kunde"}
                </span>
                {address && (
                  <span className="flex items-center gap-1 hidden sm:flex">
                    <MapPin className="h-3 w-3" />
                    {address}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {period}
                </span>
                {projectType && (
                  <span className="text-muted-foreground/70">{projectType}</span>
                )}
                {technicianNames.length > 0 && (
                  <span className="flex items-center gap-1 hidden md:flex">
                    <Users className="h-3 w-3" />
                    {technicianNames.slice(0, 3).join(", ")}
                    {technicianNames.length > 3 && ` +${technicianNames.length - 3}`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Opprett dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="rounded-xl gap-1.5 h-8 text-xs font-medium">
                  <Plus className="h-3.5 w-3.5" />
                  Opprett
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => onNavigateTab("plan")} className="gap-2">
                  <CalendarCheck className="h-3.5 w-3.5" /> Oppgave
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigateTab("skjemaer")} className="gap-2">
                  <ClipboardList className="h-3.5 w-3.5" /> Skjema
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigateTab("dokumenter")} className="gap-2">
                  <FileText className="h-3.5 w-3.5" /> Dokument
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigateTab("epost")} className="gap-2">
                  <Mail className="h-3.5 w-3.5" /> E-post
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigateTab("risiko")} className="gap-2">
                  <AlertTriangle className="h-3.5 w-3.5" /> Risiko / Avvik
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Planlegg */}
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-1.5 h-8 text-xs font-medium hidden sm:flex"
              onClick={() => onNavigateTab("plan")}
            >
              <CalendarCheck className="h-3.5 w-3.5" />
              Planlegg
            </Button>

            {/* More menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success("Lenke kopiert");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Kopier lenke
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => window.open(window.location.href, "_blank")}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Åpne i ny fane
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
