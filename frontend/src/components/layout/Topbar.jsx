import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronDown, KeyRound, LogOut, Menu, UserCircle } from 'lucide-react';
import { useNotifications } from '../../context/NotificationsContext.jsx';
import { ROLE_LABELS } from '../../utils/navigation.js';
import styles from './Topbar.module.css';

/** Barra superior: botón de menú (móvil), campana de notificaciones y menú del usuario. */
export default function Topbar({ user, onMenuClick, onLogout, loggingOut }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { unread } = useNotifications();
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const fullName = `${user.nombres} ${user.apellidos}`;
  const initials = `${user.nombres[0] ?? ''}${user.apellidos[0] ?? ''}`.toUpperCase();

  return (
    <header className={styles.topbar}>
      <button type="button" className={styles.menuButton} onClick={onMenuClick} aria-label="Abrir menú">
        <Menu size={22} aria-hidden="true" />
      </button>

      <div className={styles.spacer} />

      <Link
        to="/notificaciones"
        className={styles.iconButton}
        aria-label={unread > 0 ? `Notificaciones (${unread} sin leer)` : 'Notificaciones'}
      >
        <Bell size={20} aria-hidden="true" />
        {unread > 0 ? <span className={styles.bellBadge} aria-hidden="true">{unread > 99 ? '99+' : unread}</span> : null}
      </Link>

      <div className={styles.userMenu} ref={menuRef}>
        <button
          type="button"
          className={styles.userButton}
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className={styles.avatar} aria-hidden="true">
            {initials}
          </span>
          <span className={styles.userText}>
            <span className={styles.userName}>{fullName}</span>
            <span className={styles.userRole}>{ROLE_LABELS[user.rol] ?? user.rol}</span>
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>

        {menuOpen ? (
          <div className={styles.dropdown} role="menu">
            <div className={styles.dropdownHeader}>
              <p className={styles.dropdownName}>{fullName}</p>
              <p className={styles.dropdownMail}>{user.correo}</p>
              {user.dependencia ? <p className={styles.dropdownMail}>{user.dependencia}</p> : null}
            </div>
            <Link to="/perfil" role="menuitem" className={styles.item} onClick={() => setMenuOpen(false)}>
              <UserCircle size={16} aria-hidden="true" /> Mi perfil
            </Link>
            <Link to="/cambiar-password" role="menuitem" className={styles.item} onClick={() => setMenuOpen(false)}>
              <KeyRound size={16} aria-hidden="true" /> Cambiar contraseña
            </Link>
            <button type="button" role="menuitem" className={`${styles.item} ${styles.logout}`} onClick={onLogout} disabled={loggingOut}>
              <LogOut size={16} aria-hidden="true" /> {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
