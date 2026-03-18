import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { GatewayAlertsProvider } from "@/hooks/useGatewayAlerts";
import DashboardLayout from "@/components/DashboardLayout";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardOverview = lazy(() => import("@/pages/DashboardOverview"));
const CredentialsPage = lazy(() => import("@/pages/CredentialsPage"));
const ApiClientsPage = lazy(() => import("@/pages/ApiClientsPage"));
const ImportExportPage = lazy(() => import("@/pages/ImportExportPage"));
const RequestLogsPage = lazy(() => import("@/pages/RequestLogsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const DocsPage = lazy(() => import("@/pages/DocsPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <p className="text-muted-foreground">Memuat halaman...</p>
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Memuat sesi...</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <DashboardLayout>{children}</DashboardLayout>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <GatewayAlertsProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><DashboardOverview /></ProtectedRoute>} />
                <Route path="/credentials" element={<ProtectedRoute><CredentialsPage /></ProtectedRoute>} />
                <Route path="/clients" element={<ProtectedRoute><ApiClientsPage /></ProtectedRoute>} />
                <Route path="/import-export" element={<ProtectedRoute><ImportExportPage /></ProtectedRoute>} />
                <Route path="/logs" element={<ProtectedRoute><RequestLogsPage /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                <Route path="/docs" element={<ProtectedRoute><DocsPage /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </GatewayAlertsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
