import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmployeeImport } from "@/components/EmployeeImport";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface UserRow {
  id: string;
  email: string;
  name: string;
  roleName: string | null;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);

    // Fetch users from edge function
    const { data, error } = await supabase.functions.invoke("list-users");
    if (error || !data?.users) {
      setLoading(false);
      return;
    }
    const userList: { id: string; email: string; name: string }[] = data.users;

    // Fetch role assignments + role names from new system
    const { data: assignments } = await supabase
      .from("user_role_assignments")
      .select("user_id, role_id");
    const { data: roles } = await supabase
      .from("roles")
      .select("id, name");

    const roleMap = new Map((roles as any[] || []).map((r: any) => [r.id, r.name]));

    const enriched: UserRow[] = userList.map((u) => {
      const userAssignment = (assignments as any[] || []).find((a: any) => a.user_id === u.id);
      return {
        ...u,
        roleName: userAssignment ? roleMap.get(userAssignment.role_id) || null : null,
      };
    });

    setUsers(enriched);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold">Brukeroversikt</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Roller administreres under Tilgangsstyring → Brukere.
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
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      {user.roleName ? (
                        <Badge variant="secondary">{user.roleName}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Ingen rolle</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-8">
          <EmployeeImport />
        </div>
      </div>
    </div>
  );
}
