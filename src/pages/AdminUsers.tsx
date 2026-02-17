import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminUsers, type AdminUser, type AppRole } from "@/lib/mock-data";
import { ArrowLeft, Shield, ShieldCheck, UserX, UserCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const roleBadge: Record<AppRole, { label: string; variant: "default" | "secondary" | "outline" }> = {
  super_admin: { label: "Super Admin", variant: "default" },
  admin: { label: "Admin", variant: "secondary" },
  montør: { label: "Montør", variant: "outline" },
};

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>(adminUsers);

  const handleRoleChange = (userId: string, newRole: AppRole) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );
    toast.success("Rolle oppdatert");
  };

  const handleToggleActive = (userId: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, active: !u.active } : u
      )
    );
    toast.success("Brukerstatus oppdatert");
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b bg-card px-6 py-3">
        <Button size="icon" variant="ghost" onClick={() => navigate("/")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">Administrer brukere</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm text-muted-foreground mb-4">
            Kun super_admin kan endre roller og deaktivere brukere.
          </p>

          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Navn</TableHead>
                  <TableHead>E-post</TableHead>
                  <TableHead>Rolle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Handlinger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const badge = roleBadge[user.role];
                  return (
                    <TableRow key={user.id} className={!user.active ? "opacity-50" : ""}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {user.role === "super_admin" ? (
                            <ShieldCheck className="h-4 w-4 text-primary" />
                          ) : (
                            <Shield className="h-4 w-4 text-muted-foreground" />
                          )}
                          {user.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(v) => handleRoleChange(user.id, v as AppRole)}
                        >
                          <SelectTrigger className="w-[140px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="super_admin">Super Admin</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.active ? "default" : "outline"}>
                          {user.active ? "Aktiv" : "Deaktivert"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleActive(user.id)}
                          className="gap-1.5"
                        >
                          {user.active ? (
                            <><UserX className="h-3.5 w-3.5" /> Deaktiver</>
                          ) : (
                            <><UserCheck className="h-3.5 w-3.5" /> Aktiver</>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </div>
  );
}
