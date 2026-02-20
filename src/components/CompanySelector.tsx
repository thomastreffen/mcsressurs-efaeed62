import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building } from "lucide-react";

export function CompanySelector() {
  const { companies, activeCompanyId, setActiveCompanyId } = useCompanyContext();

  if (companies.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <Building className="h-4 w-4 text-muted-foreground shrink-0" />
      <Select value={activeCompanyId || ""} onValueChange={setActiveCompanyId}>
        <SelectTrigger className="w-[200px] h-8 text-xs">
          <SelectValue placeholder="Velg selskap" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
