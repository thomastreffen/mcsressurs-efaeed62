import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building, FolderTree } from "lucide-react";
import { CompaniesTab } from "@/components/access-control/CompaniesTab";
import { DepartmentsTab } from "@/components/access-control/DepartmentsTab";

export default function OrganisationPage() {
  const [tab, setTab] = useState("companies");

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Organisasjon</h1>
        <p className="text-sm text-muted-foreground">
          Administrer selskaper og avdelinger
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="companies" className="gap-1.5">
            <Building className="h-3.5 w-3.5" />
            Selskaper
          </TabsTrigger>
          <TabsTrigger value="departments" className="gap-1.5">
            <FolderTree className="h-3.5 w-3.5" />
            Avdelinger
          </TabsTrigger>
        </TabsList>

        <TabsContent value="companies">
          <CompaniesTab />
        </TabsContent>
        <TabsContent value="departments">
          <DepartmentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
