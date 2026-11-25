import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth.js';
import { NotificationsProvider } from '../../context/NotificationsContext.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import styles from './AppLayout.module.css';

/** Estructura de las pantallas autenticadas: menú lateral por perfil, barra superior y contenido. */
export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Al navegar en móvil se cierra el menú
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      toast.error('No se pudo cerrar la sesión en el servidor, pero se cerró en este dispositivo');
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <NotificationsProvider>
    <div className={styles.shell}>
      <a href="#contenido" className={styles.skip}>
        Saltar al contenido
      </a>
      <Sidebar role={user.rol} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className={styles.main}>
        <Topbar user={user} onMenuClick={() => setMenuOpen(true)} onLogout={handleLogout} loggingOut={loggingOut} />
        <main id="contenido" className={styles.content} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
    </NotificationsProvider>
  );
}
