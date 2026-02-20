import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building, FolderTree, Shield, Users } from "lucide-react";
import { CompaniesTab } from "@/components/access-control/CompaniesTab";
import { DepartmentsTab } from "@/components/access-control/DepartmentsTab";
import { RolesTab } from "@/components/access-control/RolesTab";
import { UsersAccessTab } from "@/components/access-control/UsersAccessTab";

export default function AccessControlPage() {
  const [tab, setTab] = useState("companies");

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Tilgangsstyring</h1>
        <p className="text-sm text-muted-foreground">
          Administrer selskaper, avdelinger, roller og brukertilganger
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="companies" className="gap-1.5">
            <Building className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Selskaper</span>
          </TabsTrigger>
          <TabsTrigger value="departments" className="gap-1.5">
            <FolderTree className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Avdelinger</span>
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Roller</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Brukere</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="companies">
          <CompaniesTab />
        </TabsContent>
        <TabsContent value="departments">
          <DepartmentsTab />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersAccessTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
