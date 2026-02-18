import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "super_admin" | "admin" | "montør";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: AppRole;
}

interface AuthContextType {
  session: Session | null;
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async (supaUser: User): Promise<AuthUser> => {
    // Try fetching from DB first, fall back to user_metadata
    let role: AppRole = (supaUser.user_metadata?.app_role as AppRole) || "montør";
    
    try {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", supaUser.id)
        .single();
      if (data?.role) {
        role = data.role as AppRole;
      }
    } catch {
      // RLS may block this query during initial login, use metadata fallback
      console.warn("Could not fetch role from DB, using metadata fallback:", role);
    }

    return {
      id: supaUser.id,
      email: supaUser.email || "",
      name: supaUser.user_metadata?.full_name || supaUser.email || "",
      role,
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    // Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mounted) return;
        setSession(newSession);
        if (newSession?.user) {
          try {
            const authUser = await fetchRole(newSession.user);
            if (mounted) setUser(authUser);
          } catch (err) {
            console.error("Failed to fetch role:", err);
            if (mounted) setUser(null);
          }
        } else {
          setUser(null);
        }
        if (mounted) setLoading(false);
      }
    );

    // Then check existing session with a timeout to prevent infinite hang
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn("Auth loading timed out, redirecting to login");
        setLoading(false);
      }
    }, 5000);

    supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      if (!mounted) return;
      setSession(existing);
      if (existing?.user) {
        try {
          const authUser = await fetchRole(existing.user);
          if (mounted) setUser(authUser);
        } catch (err) {
          console.error("Failed to fetch role:", err);
          if (mounted) setUser(null);
        }
      }
      if (mounted) setLoading(false);
    }).catch((err) => {
      console.error("getSession failed:", err);
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchRole]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' });
    setUser(null);
    setSession(null);
  }, []);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";

  return (
    <AuthContext.Provider value={{ session, user, loading, isAdmin, isSuperAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
