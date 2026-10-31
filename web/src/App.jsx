import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { AppShell } from './layout/AppShell.jsx';
import { PulsarMark } from './layout/Logo.jsx';
import { Skeleton } from './components/ui.jsx';
import { LoginPage, ForgotPasswordPage, ResetPasswordPage } from './pages/Auth.jsx';

const Overview = lazy(() => import('./pages/Overview.jsx'));
const ClientsPage = lazy(() => import('./pages/clients/ClientsPage.jsx'));
const ClientDetail = lazy(() => import('./pages/clients/ClientDetail.jsx'));
const ProjectsPage = lazy(() => import('./pages/projects/ProjectsPage.jsx'));
const ProjectDetail = lazy(() => import('./pages/projects/ProjectDetail.jsx'));
const SalesPage = lazy(() => import('./pages/sales/SalesPage.jsx'));
const WorkPage = lazy(() => import('./pages/work/WorkPage.jsx'));
const InfrastructurePage = lazy(() => import('./pages/infrastructure/InfrastructurePage.jsx'));
const ServerDetail = lazy(() => import('./pages/infrastructure/ServerDetail.jsx'));
const DomainDetail = lazy(() => import('./pages/infrastructure/DomainDetail.jsx'));
const FinancePage = lazy(() => import('./pages/finance/FinancePage.jsx'));
const InvoiceEditor = lazy(() => import('./pages/finance/InvoiceEditor.jsx'));
const InvoiceDetail = lazy(() => import('./pages/finance/InvoiceDetail.jsx'));
const ServicesPage = lazy(() => import('./pages/ServicesPage.jsx'));
const IncidentsPage = lazy(() => import('./pages/incidents/IncidentsPage.jsx'));
const IncidentDetail = lazy(() => import('./pages/incidents/IncidentDetail.jsx'));
const TestimonialsPage = lazy(() => import('./pages/TestimonialsPage.jsx'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage.jsx'));
const ActivityPage = lazy(() => import('./pages/ActivityPage.jsx'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="app-backdrop" />
      <div className="flex flex-col items-center gap-4">
        <PulsarMark size={48} className="animate-pulse" />
        <p className="text-[12px] font-medium tracking-[0.18em] text-ink-soft">WEB PULSAR</p>
      </div>
    </div>
  );
}

function PageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}

function Protected() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location }} />;
  return <AppShell />;
}

function PublicOnly({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return children;
}

const page = (el) => <Suspense fallback={<PageFallback />}>{el}</Suspense>;

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
            <Route path="/recuperar" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
            <Route path="/restablecer" element={<ResetPasswordPage />} />
            <Route element={<Protected />}>
              <Route index element={page(<Overview />)} />
              <Route path="clientes" element={page(<ClientsPage />)} />
              <Route path="clientes/:id" element={page(<ClientDetail />)} />
              <Route path="ventas" element={page(<SalesPage />)} />
              <Route path="trabajo" element={page(<WorkPage />)} />
              <Route path="desarrollo" element={<Navigate to="/trabajo" replace />} />
              <Route path="proyectos" element={page(<ProjectsPage />)} />
              <Route path="proyectos/:id" element={page(<ProjectDetail />)} />
              <Route path="infraestructura" element={page(<InfrastructurePage />)} />
              <Route path="infraestructura/servidores/:id" element={page(<ServerDetail />)} />
              <Route path="infraestructura/dominios/:id" element={page(<DomainDetail />)} />
              <Route path="finanzas" element={page(<FinancePage />)} />
              <Route path="finanzas/facturas/nueva" element={page(<InvoiceEditor />)} />
              <Route path="finanzas/facturas/:id" element={page(<InvoiceDetail />)} />
              <Route path="finanzas/facturas/:id/editar" element={page(<InvoiceEditor />)} />
              <Route path="servicios" element={page(<ServicesPage />)} />
              <Route path="incidencias" element={page(<IncidentsPage />)} />
              <Route path="incidencias/:id" element={page(<IncidentDetail />)} />
              <Route path="testimonios" element={page(<TestimonialsPage />)} />
              <Route path="documentacion" element={page(<DocumentsPage />)} />
              <Route path="actividad" element={page(<ActivityPage />)} />
              <Route path="configuracion" element={page(<SettingsPage />)} />
              <Route path="*" element={page(<NotFound />)} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
