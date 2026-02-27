import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { FileText, FolderKanban, Wrench, Users } from "lucide-react";

interface CaseLinkedEntitiesProps {
  linkedOfferId?: string | null;
  linkedProjectId?: string | null;
  linkedWorkOrderId?: string | null;
  linkedLeadId?: string | null;
  /** Legacy fields from before lifecycle v1 */
  offerId?: string | null;
  projectId?: string | null;
  serviceJobId?: string | null;
  leadId?: string | null;
}

export function CaseLinkedEntities({
  linkedOfferId, linkedProjectId, linkedWorkOrderId, linkedLeadId,
  offerId, projectId, serviceJobId, leadId,
}: CaseLinkedEntitiesProps) {
  const navigate = useNavigate();

  const effectiveOffer = linkedOfferId || offerId;
  const effectiveProject = linkedProjectId || projectId;
  const effectiveService = linkedWorkOrderId || serviceJobId;
  const effectiveLead = linkedLeadId || leadId;

  const hasAny = effectiveOffer || effectiveProject || effectiveService || effectiveLead;
  if (!hasAny) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {effectiveOffer && (
        <Badge
          variant="outline"
          className="cursor-pointer text-[10px] gap-1 hover:bg-secondary/80"
          onClick={() => navigate(`/sales/offers/${effectiveOffer}`)}
        >
          <FileText className="h-3 w-3" /> Tilbud
        </Badge>
      )}
      {effectiveProject && (
        <Badge
          variant="outline"
          className="cursor-pointer text-[10px] gap-1 hover:bg-secondary/80"
          onClick={() => navigate(`/projects/${effectiveProject}`)}
        >
          <FolderKanban className="h-3 w-3" /> Prosjekt
        </Badge>
      )}
      {effectiveService && (
        <Badge
          variant="outline"
          className="cursor-pointer text-[10px] gap-1 hover:bg-secondary/80"
          onClick={() => navigate(`/jobs/${effectiveService}`)}
        >
          <Wrench className="h-3 w-3" /> Jobb
        </Badge>
      )}
      {effectiveLead && (
        <Badge
          variant="outline"
          className="cursor-pointer text-[10px] gap-1 hover:bg-secondary/80"
          onClick={() => navigate(`/sales/leads/${effectiveLead}`)}
        >
          <Users className="h-3 w-3" /> Lead
        </Badge>
      )}
    </div>
  );
}
