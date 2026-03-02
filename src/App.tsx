import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";

// Redirect helpers for parameterized routes
function RedirectJobToProject() {
  const { id } = useParams();
  return <Navigate to={`/projects/${id}`} replace />;
}
function RedirectContractToProject() {
  const { id } = useParams();
  return <Navigate to={`/projects/contracts/${id}`} replace />;
}
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import OverviewPage from "./pages/OverviewPage";
import KpiDashboard from "./pages/KpiDashboard";
import JobsPage from "./pages/JobsPage";
import ResourcePlan from "./pages/ResourcePlan";
import JobDetail from "./pages/JobDetail";
import AdminUsers from "./pages/AdminUsers";
import OrganisationPage from "./pages/OrganisationPage";
import PeoplePage from "./pages/PeoplePage";
import PersonDetailPage from "./pages/PersonDetailPage";
import RolesPage from "./pages/RolesPage";
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
import ApproveChangeOrderPage from "./pages/ApproveChangeOrderPage";
import CompanySettings from "./pages/CompanySettings";
import TrashPage from "./pages/TrashPage";
import AccessControlPage from "./pages/AccessControlPage";
import IntegrationsDebug from "./pages/IntegrationsDebug";
import IntegrationHealthPage from "./pages/IntegrationHealthPage";
import RegulationPage from "./pages/RegulationPage";
import FagInsightsPage from "./pages/FagInsightsPage";
import SystemHealthPage from "./pages/SystemHealthPage";
import DataIntegrityPage from "./pages/DataIntegrityPage";
import ContractsPage from "./pages/ContractsPage";
import ContractDetail from "./pages/ContractDetail";
import ContractCronPage from "./pages/ContractCronPage";
import EmployeesPage from "./pages/EmployeesPage";
import PersonnelDetailPage from "./pages/PersonnelDetailPage";
import CustomersPage from "./pages/CustomersPage";
import CustomerNewPage from "./pages/CustomerNewPage";
import CustomerDetailPage from "./pages/CustomerDetailPage";
import CustomerImportPage from "./pages/CustomerImportPage";
import ProjectNewPage from "./pages/ProjectNewPage";
import InboxPage from "./pages/InboxPage";
import FormBuilderPage from "./pages/FormBuilderPage";
import FormFillPage from "./pages/FormFillPage";
import SuperofficeSettingsPage from "./pages/SuperofficeSettingsPage";
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
            <Route path="/approve-change-order" element={<ApproveChangeOrderPage />} />

            {/* App layout with sidebar */}
            <Route
              element={
                <ProtectedRoute requiredRoles={["admin", "super_admin", "montør"]}>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/inbox" element={
                <ProtectedRoute requiredPermission="postkontor.view">
                  <InboxPage />
                </ProtectedRoute>
              } />
              <Route path="/dashboard" element={<Navigate to="/overview" replace />} />
              <Route path="/projects" element={<JobsPage />} />
              <Route path="/projects/new" element={<ProjectNewPage />} />
              <Route path="/projects/:id" element={<JobDetail />} />
              <Route path="/projects/plan" element={<ResourcePlan />} />
              <Route path="/projects/contracts" element={<ContractsPage />} />
              <Route path="/projects/contracts/:id" element={<ContractDetail />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/new" element={<CustomerNewPage />} />
              <Route path="/customers/import" element={<CustomerImportPage />} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
              {/* Legacy redirects */}
              <Route path="/jobs" element={<Navigate to="/projects" replace />} />
              <Route path="/jobs/:id" element={<RedirectJobToProject />} />
              <Route path="/resource-plan" element={<Navigate to="/projects/plan" replace />} />
              <Route path="/contracts" element={<Navigate to="/projects/contracts" replace />} />
              <Route path="/contracts/:id" element={<RedirectContractToProject />} />
              <Route path="/sales/dashboard" element={<Navigate to="/sales" replace />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/fag" element={<RegulationPage />} />
              <Route path="/forms/:id" element={<FormFillPage />} />
              <Route
                path="/admin/forms"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <FormBuilderPage />
                  </ProtectedRoute>
                }
              />

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
              {/* Tilbud is the primary module — calculations redirect here */}
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
                    <NewCalculation />
                  </ProtectedRoute>
                }
              />
              <Route path="/sales/offers/:id" element={<CalculationDetail />} />
              {/* Legacy calculation routes → redirect to offers */}
              <Route path="/sales/calculations" element={<Navigate to="/sales/offers" replace />} />
              <Route path="/sales/calculations/new" element={<Navigate to="/sales/offers/new" replace />} />
              <Route path="/sales/calculations/:id" element={<CalculationDetail />} />

              {/* Legacy calculation routes redirect */}
              <Route path="/calculations" element={<Navigate to="/sales/offers" replace />} />
              <Route path="/calculations/new" element={<Navigate to="/sales/offers/new" replace />} />
              <Route path="/calculations/:id" element={<CalculationDetail />} />

              <Route
                path="/admin/company"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <CompanySettings />
                  </ProtectedRoute>
                }
              />
              {/* Legacy redirects for old admin pages */}
              <Route path="/admin/users" element={<Navigate to="/admin/personer" replace />} />
              <Route path="/admin/access" element={<Navigate to="/admin/organisasjon" replace />} />
              <Route path="/admin/ansatte" element={<Navigate to="/admin/personer" replace />} />
              <Route path="/admin/ansatte/:id" element={<Navigate to="/admin/personer" replace />} />

              {/* New admin pages */}
              <Route
                path="/admin/organisasjon"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <OrganisationPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/personer"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <PeoplePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/personer/:id"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <PersonDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/roller"
                element={
                  <ProtectedRoute requiredRoles={["super_admin"]}>
                    <RolesPage />
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
              <Route path="/settings/integrations" element={<IntegrationsDebug />} />
              <Route
                path="/admin/integration-health"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <IntegrationHealthPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/fag-insights"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <FagInsightsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/system-health"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <SystemHealthPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/data-integrity"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <DataIntegrityPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/contract-cron"
                element={
                  <ProtectedRoute requiredRoles={["admin", "super_admin"]}>
                    <ContractCronPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/superoffice"
                element={
                  <ProtectedRoute requiredPermission="postkontor.admin">
                    <SuperofficeSettingsPage />
                  </ProtectedRoute>
                }
              />
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
