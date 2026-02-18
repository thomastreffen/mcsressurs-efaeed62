import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmployeeImport } from "@/components/EmployeeImport";
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
import { ArrowLeft, Shield, ShieldCheck, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "super_admin" | "admin" | "montør";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: AppRole | null;
}

const roleBadge: Record<AppRole, { label: string; variant: "default" | "secondary" | "outline" }> = {
  super_admin: { label: "Super Admin", variant: "default" },
  admin: { label: "Admin", variant: "secondary" },
  montør: { label: "Montør", variant: "outline" },
};

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("list-users");
    if (error || !data?.users) {
      toast.error("Kunne ikke hente brukere", { description: data?.error || error?.message });
      setLoading(false);
      return;
    }
    setUsers(data.users);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    setChangingRole(userId);
    const { data, error } = await supabase.functions.invoke("manage-role", {
      body: { targetUserId: userId, newRole },
    });

    if (error || data?.error) {
      toast.error("Rolleendring feilet", { description: data?.error || error?.message });
    } else {
      toast.success("Rolle oppdatert til " + newRole);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    }
    setChangingRole(null);
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
            Kun super_admin kan endre roller.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Navn</TableHead>
                    <TableHead>E-post</TableHead>
                    <TableHead>Rolle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const badge = user.role ? roleBadge[user.role] : null;
                    const isSuperAdmin = user.role === "super_admin";
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {isSuperAdmin ? (
                              <ShieldCheck className="h-4 w-4 text-primary" />
                            ) : (
                              <Shield className="h-4 w-4 text-muted-foreground" />
                            )}
                            {user.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell>
                          {isSuperAdmin ? (
                            <Badge variant="default">Super Admin</Badge>
                          ) : (
                            <Select
                              value={user.role || ""}
                              onValueChange={(v) => handleRoleChange(user.id, v as AppRole)}
                              disabled={changingRole === user.id}
                            >
                              <SelectTrigger className="w-[140px] h-8">
                                <SelectValue placeholder="Velg rolle" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="montør">Montør</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-8">
            <EmployeeImport />
          </div>
        </div>
      </main>
    </div>
  );
}
