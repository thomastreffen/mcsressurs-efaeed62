import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Company {
  id: string;
  name: string;
  org_number: string | null;
}

interface CompanyContextType {
  companies: Company[];
  activeCompanyId: string | null;
  activeCompany: Company | null;
  setActiveCompanyId: (id: string) => void;
  loading: boolean;
  userMemberships: { company_id: string; department_id: string | null }[];
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userMemberships, setUserMemberships] = useState<{ company_id: string; department_id: string | null }[]>([]);

  useEffect(() => {
    if (!user) {
      setCompanies([]);
      setActiveCompanyIdState(null);
      setLoading(false);
      return;
    }

    async function fetch() {
      // Get user memberships
      const { data: memberships } = await supabase
        .from("user_memberships")
        .select("company_id, department_id")
        .eq("user_id", user!.id)
        .eq("is_active", true);

      setUserMemberships(
        (memberships || []).map((m: any) => ({
          company_id: m.company_id,
          department_id: m.department_id,
        }))
      );

      // Get all active companies (for super_admin) or only membership companies
      const { data: comps } = await supabase
        .from("internal_companies")
        .select("id, name, org_number")
        .eq("is_active", true)
        .order("name");

      const companyList: Company[] = (comps || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        org_number: c.org_number,
      }));

      setCompanies(companyList);

      // Restore from localStorage or pick first
      const stored = localStorage.getItem("mcs_active_company");
      if (stored && companyList.some((c) => c.id === stored)) {
        setActiveCompanyIdState(stored);
      } else if (companyList.length > 0) {
        setActiveCompanyIdState(companyList[0].id);
      }

      setLoading(false);
    }

    fetch();
  }, [user]);

  const setActiveCompanyId = useCallback((id: string) => {
    setActiveCompanyIdState(id);
    localStorage.setItem("mcs_active_company", id);
  }, []);

  const activeCompany = companies.find((c) => c.id === activeCompanyId) || null;

  return (
    <CompanyContext.Provider
      value={{ companies, activeCompanyId, activeCompany, setActiveCompanyId, loading, userMemberships }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompanyContext() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompanyContext must be used within CompanyProvider");
  return ctx;
}
