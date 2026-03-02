import { RolesTab } from "@/components/access-control/RolesTab";

export default function RolesPage() {
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Roller</h1>
        <p className="text-sm text-muted-foreground">
          Administrer roller og tilhørende rettigheter
        </p>
      </div>
      <RolesTab />
    </div>
  );
}
