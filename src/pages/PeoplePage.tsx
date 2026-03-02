import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Archive, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";

interface PersonRow {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  company_name: string | null;
  department_name: string | null;
  is_plannable_resource: boolean;
  archived_at: string | null;
  trade_certificate_type: string | null;
  role_names: string[];
  has_user_account: boolean;
}

export default function PeoplePage() {
  const navigate = useNavigate();
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchPeople();
  }, [showArchived]);

  const fetchPeople = async () => {
    setLoading(true);

    // Fetch people + employment profiles + user accounts + roles
    const [
      { data: peopleData },
      { data: profiles },
      { data: accounts },
      { data: userRoles },
      { data: roles },
      { data: companies },
      { data: departments },
    ] = await Promise.all([
      supabase.from("people").select("id, full_name, email, is_active, created_at").order("full_name"),
      supabase.from("employment_profiles").select("person_id, company_id, department_id, is_plannable_resource, archived_at, trade_certificate_type"),
      supabase.from("user_accounts").select("id, person_id, auth_user_id, is_active"),
      supabase.from("user_roles_v2").select("user_account_id, role_id"),
      supabase.from("roles").select("id, name"),
      supabase.from("internal_companies").select("id, name"),
      supabase.from("departments").select("id, name"),
    ]);

    const compMap = new Map((companies as any[] || []).map((c: any) => [c.id, c.name]));
    const deptMap = new Map((departments as any[] || []).map((d: any) => [d.id, d.name]));
    const roleMap = new Map((roles as any[] || []).map((r: any) => [r.id, r.name]));

    const profileMap = new Map<string, any>();
    for (const ep of (profiles as any[] || [])) {
      profileMap.set(ep.person_id, ep);
    }

    const accountMap = new Map<string, any>();
    for (const ua of (accounts as any[] || [])) {
      accountMap.set(ua.person_id, ua);
    }

    const rolesByAccount = new Map<string, string[]>();
    for (const ur of (userRoles as any[] || [])) {
      const arr = rolesByAccount.get(ur.user_account_id) || [];
      const name = roleMap.get(ur.role_id);
      if (name) arr.push(name);
      rolesByAccount.set(ur.user_account_id, arr);
    }

    const rows: PersonRow[] = (peopleData as any[] || []).map((p: any) => {
      const ep = profileMap.get(p.id);
      const ua = accountMap.get(p.id);
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        is_active: p.is_active,
        company_name: ep ? compMap.get(ep.company_id) || null : null,
        department_name: ep?.department_id ? deptMap.get(ep.department_id) || null : null,
        is_plannable_resource: ep?.is_plannable_resource || false,
        archived_at: ep?.archived_at || null,
        trade_certificate_type: ep?.trade_certificate_type || null,
        role_names: ua ? (rolesByAccount.get(ua.id) || []) : [],
        has_user_account: !!ua,
      };
    });

    const filtered = showArchived ? rows : rows.filter((r) => !r.archived_at);
    setPeople(filtered);
    setLoading(false);
  };

  const displayed = search
    ? people.filter((p) =>
        p.full_name.toLowerCase().includes(search.toLowerCase()) ||
        p.email.toLowerCase().includes(search.toLowerCase())
      )
    : people;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Personer</h1>
          <p className="text-sm text-muted-foreground">
            Samlet oversikt over ansatte og brukere
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Søk..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 w-[200px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Arkiverte</span>
            <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Users className="h-10 w-10" />
          <p className="text-sm">Ingen personer funnet.</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Navn</TableHead>
                <TableHead className="hidden sm:table-cell">Rolle(r)</TableHead>
                <TableHead className="hidden md:table-cell">Firma</TableHead>
                <TableHead className="hidden lg:table-cell">Avdeling</TableHead>
                <TableHead className="text-center">Planleggbar</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.map((person) => (
                <TableRow
                  key={person.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/admin/personer/${person.id}`)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{person.full_name}</p>
                      <p className="text-xs text-muted-foreground">{person.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {person.role_names.length > 0 ? (
                        person.role_names.map((r) => (
                          <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {person.company_name || "–"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {person.department_name || "–"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {person.is_plannable_resource ? (
                      <Badge variant="success" className="text-[10px]">Ja</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Nei</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {person.archived_at ? (
                      <Badge variant="destructive" className="text-[10px]">Arkivert</Badge>
                    ) : !person.has_user_account ? (
                      <Badge variant="outline" className="text-[10px]">Kun ansatt</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Aktiv</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
