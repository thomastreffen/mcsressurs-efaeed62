import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import KpiDashboard from "./pages/KpiDashboard";
import JobsPage from "./pages/JobsPage";
import ResourcePlan from "./pages/ResourcePlan";
import JobDetail from "./pages/JobDetail";
import AdminUsers from "./pages/AdminUsers";
import AdminSettings from "./pages/AdminSettings";
import NotificationsPage from "./pages/NotificationsPage";
import CalculationsPage from "./pages/CalculationsPage";
import CalculationDetail from "./pages/CalculationDetail";
import NewCalculation from "./pages/NewCalculation";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";
import ApprovalPage from "./pages/ApprovalPage";
import OffersPage from "./pages/OffersPage";
import NewOfferWizard from "./pages/NewOfferWizard";
import LeadsPage from "./pages/LeadsPage";
import LeadDetail from "./pages/LeadDetail";
import PipelinePage from "./pages/PipelinePage";
import SalesDashboard from "./pages/SalesDashboard";
import OfferAcceptPage from "./pages/OfferAcceptPage";
import CompanySettings from "./pages/CompanySettings";
import TrashPage from "./pages/TrashPage";
import AccessControlPage from "./pages/AccessControlPage";
import IntegrationsDebug from "./pages/IntegrationsDebug";
import { CompanyProvider } from "@/hooks/useCompanyContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CompanyProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/approval/:token" element={<ApprovalPage />} />
            <Route path="/offer/accept/:token" element={<OfferAcceptPage />} />

            {/* App layout with sidebar */}
            <Route
              element={
                <ProtectedRoute requiredRoles={["admin", "super_admin", "montør"]}>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<KpiDashboard />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/resource-plan" element={<ResourcePlan />} />
              <Route path="/notifications" element={<NotificationsPage />} />

              {/* Sales module - admin only */}
              <Route
                path="/sales"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <SalesDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales/pipeline"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <PipelinePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales/leads"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <LeadsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales/leads/:id"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <LeadDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales/calculations"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <CalculationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales/calculations/new"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <NewCalculation />
                  </ProtectedRoute>
                }
              />
              <Route path="/sales/calculations/:id" element={<CalculationDetail />} />
              <Route
                path="/sales/offers"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <OffersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales/offers/new"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <NewOfferWizard />
                  </ProtectedRoute>
                }
              />

              {/* Legacy routes redirect */}
              <Route path="/calculations" element={<CalculationsPage />} />
              <Route path="/calculations/new" element={<NewCalculation />} />
              <Route path="/calculations/:id" element={<CalculationDetail />} />

              <Route
                path="/admin/company"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <CompanySettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <AdminUsers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <AdminSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/trash"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <TrashPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/access"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <AccessControlPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/settings/integrations" element={<IntegrationsDebug />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </CompanyProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
