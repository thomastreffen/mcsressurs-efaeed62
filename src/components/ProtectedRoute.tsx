import { Navigate } from "react-router-dom";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: AppRole[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { session, user, loading } = useAuth();
  const [roleSettled, setRoleSettled] = useState(false);

  // Give the background role fetch a moment to complete before checking roles
  useEffect(() => {
    if (!loading && user) {
      const timer = setTimeout(() => setRoleSettled(true), 300);
      return () => clearTimeout(timer);
    }
    if (!loading && !user) {
      setRoleSettled(true);
    }
  }, [loading, user, user?.role]);

  if (loading || (!roleSettled && user)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && user && !requiredRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
