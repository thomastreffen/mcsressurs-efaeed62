import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "super_admin" | "admin" | "montør";

const AZURE_TENANT_ID = "e1b96c2a-c273-40b9-bb46-a2a7b570e133";

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
    let role: AppRole = "montør";

    // Try DB first
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", supaUser.id)
        .maybeSingle();
      
      if (data?.role) {
        role = data.role as AppRole;
        console.log("[Auth] Role from DB:", role);
      } else if (error) {
        console.warn("[Auth] DB role query error:", error.message);
        // Fallback to user_metadata
        const metaRole = supaUser.user_metadata?.app_role as AppRole;
        if (metaRole) {
          role = metaRole;
          console.log("[Auth] Role from metadata fallback:", role);
        }
      }
    } catch (err) {
      console.warn("[Auth] Role fetch exception, using metadata fallback");
      const metaRole = supaUser.user_metadata?.app_role as AppRole;
      if (metaRole) role = metaRole;
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mounted) return;
        console.log("[Auth] State change:", _event, !!newSession);
        setSession(newSession);
        if (newSession?.user) {
          const authUser = await fetchRole(newSession.user);
          if (mounted) setUser(authUser);
        } else {
          setUser(null);
        }
        if (mounted) setLoading(false);
      }
    );

    const timeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn("[Auth] Loading timed out");
        setLoading(false);
      }
    }, 5000);

    supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      if (!mounted) return;
      setSession(existing);
      if (existing?.user) {
        const authUser = await fetchRole(existing.user);
        if (mounted) setUser(authUser);
      }
      if (mounted) setLoading(false);
    }).catch((err) => {
      console.error("[Auth] getSession failed:", err);
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchRole]);

  const signOut = useCallback(async () => {
    console.log("[Auth] Signing out...");
    try {
      // 1. Sign out from Supabase (clears local tokens)
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      console.error("[Auth] Supabase signOut error:", err);
    }
    
    // 2. Clear local state immediately
    setUser(null);
    setSession(null);

    // 3. Redirect to Microsoft logout endpoint to clear SSO session
    const postLogoutRedirect = encodeURIComponent(`${window.location.origin}/login`);
    window.location.href = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/logout?post_logout_redirect_uri=${postLogoutRedirect}`;
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
