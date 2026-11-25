import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout.jsx';
import LoginPage from '../pages/auth/LoginPage.jsx';
import ChangePasswordPage from '../pages/auth/ChangePasswordPage.jsx';
import DashboardPage from '../pages/DashboardPage.jsx';
import ProfilePage from '../pages/ProfilePage.jsx';
import PlaceholderPage from '../pages/PlaceholderPage.jsx';
import UsersPage from '../pages/admin/UsersPage.jsx';
import CategoriesPage from '../pages/admin/CategoriesPage.jsx';
import ServicesPage from '../pages/admin/ServicesPage.jsx';
import AuditPage from '../pages/admin/AuditPage.jsx';
import ReportsPage from '../pages/ReportsPage.jsx';
import NotificationsPage from '../pages/NotificationsPage.jsx';
import DependenciesPage from '../pages/admin/DependenciesPage.jsx';
import NewRequestPage from '../pages/requests/NewRequestPage.jsx';
import RequestsPage from '../pages/requests/RequestsPage.jsx';
import RequestDetailPage from '../pages/requests/RequestDetailPage.jsx';
import SystemStatus from '../pages/SystemStatus.jsx';
import NotFound from '../pages/NotFound.jsx';
import { ProtectedRoute, PublicOnlyRoute, RoleRoute, CHANGE_PASSWORD_PATH, LOGIN_PATH } from './guards.jsx';
import { APP_ROUTES, HOME_PATH } from '../utils/navigation.js';

/** Pantallas ya construidas; el resto de rutas de APP_ROUTES usa PlaceholderPage hasta su fase. */
const IMPLEMENTED = {
  '/dashboard': <DashboardPage />,
  '/perfil': <ProfilePage />,
  '/solicitudes': <RequestsPage />,
  '/asignaciones': <RequestsPage />,
  '/solicitudes/nueva': <NewRequestPage />,
  '/admin/usuarios': <UsersPage />,
  '/admin/categorias': <CategoriesPage />,
  '/admin/servicios': <ServicesPage />,
  '/admin/dependencias': <DependenciesPage />,
  '/notificaciones': <NotificationsPage />,
  '/reportes': <ReportsPage />,
  '/admin/auditoria': <AuditPage />,
};

const DESCRIPTIONS = {
  '/solicitudes': 'Consulta y filtra las solicitudes según tu perfil.',
  '/solicitudes/nueva': 'Registra una nueva solicitud de servicio.',
  '/asignaciones': 'Solicitudes que te fueron asignadas para atención.',
  '/reportes': 'Indicadores y reportes de gestión.',
  '/admin/usuarios': 'Crea, edita y desactiva usuarios.',
  '/admin/categorias': 'Gestiona las categorías del catálogo.',
  '/admin/servicios': 'Gestiona los servicios y su tiempo de atención.',
  '/admin/dependencias': 'Gestiona las dependencias y su supervisión.',
  '/admin/auditoria': 'Consulta el registro de auditoría del sistema.',
  '/notificaciones': 'Avisos sobre el avance de tus solicitudes.',
};

/**
 * Enrutador principal.
 *  - Públicas: /login (solo visitantes) y /estado (diagnóstico del sistema).
 *  - /cambiar-password: requiere sesión, sin menú (es obligatorio en el primer ingreso).
 *  - Autenticadas: dentro de AppLayout; cada ruta se restringe a los perfiles de utils/navigation.js.
 * Esto es solo control de presentación: el backend autoriza cada petición por su cuenta.
 */
export default function AppRouter() {
  return (
    <Routes>
      <Route path="/estado" element={<SystemStatus />} />

      <Route element={<PublicOnlyRoute />}>
        <Route path={LOGIN_PATH} element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path={CHANGE_PASSWORD_PATH} element={<ChangePasswordPage />} />

        <Route element={<AppLayout />}>
          {APP_ROUTES.map((route) => (
            <Route key={route.path} element={<RoleRoute roles={route.roles} />}>
              <Route
                path={route.path}
                element={
                  IMPLEMENTED[route.path] ?? (
                    <PlaceholderPage title={route.label} description={DESCRIPTIONS[route.path]} phase={route.phase} />
                  )
                }
              />
            </Route>
          ))}
          <Route path="/solicitudes/:id" element={<RequestDetailPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to={HOME_PATH} replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
