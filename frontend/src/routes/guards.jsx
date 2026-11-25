import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import FullPageSpinner from '../components/common/FullPageSpinner.jsx';
import ForbiddenPage from '../pages/ForbiddenPage.jsx';
import { HOME_PATH } from '../utils/navigation.js';

export const LOGIN_PATH = '/login';
export const CHANGE_PASSWORD_PATH = '/cambiar-password';

/**
 * Exige sesión iniciada. Mientras se verifica la sesión muestra un indicador de carga
 * (así no hay "parpadeo" hacia el login). Sin sesión, lleva al login recordando la
 * ruta pedida. Si el usuario debe cambiar su contraseña, solo puede ver esa pantalla.
 */
export function ProtectedRoute() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner label="Verificando tu sesión…" />;

  if (status !== 'authenticated') {
    return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname + location.search }} />;
  }

  const mustChange = user.debe_cambiar_password;
  const onChangePage = location.pathname === CHANGE_PASSWORD_PATH;
  if (mustChange && !onChangePage) return <Navigate to={CHANGE_PASSWORD_PATH} replace />;

  return <Outlet />;
}

/**
 * Restringe una ruta a ciertos perfiles. Si el perfil no está permitido muestra la
 * pantalla de acceso denegado (403) dentro del layout, sin revelar el contenido.
 * Va siempre dentro de ProtectedRoute.
 *
 * @param {{roles: string[]}} props
 */
export function RoleRoute({ roles }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.rol)) return <ForbiddenPage />;
  return <Outlet />;
}

/** Rutas solo para visitantes (login): si ya hay sesión, redirige al inicio. */
export function PublicOnlyRoute() {
  const { status, user } = useAuth();
  if (status === 'loading') return <FullPageSpinner label="Verificando tu sesión…" />;
  if (status === 'authenticated') {
    return <Navigate to={user.debe_cambiar_password ? CHANGE_PASSWORD_PATH : HOME_PATH} replace />;
  }
  return <Outlet />;
}
