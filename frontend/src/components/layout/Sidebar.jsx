import { NavLink } from 'react-router-dom';
import { GraduationCap, X } from 'lucide-react';
import { menuSectionsForRole } from '../../utils/navigation.js';
import styles from './Sidebar.module.css';

/**
 * Menú lateral. Las opciones salen de utils/navigation.js según el perfil del usuario,
 * por lo que cada perfil solo ve lo que le corresponde.
 */
export default function Sidebar({ role, open, onClose }) {
  const sections = menuSectionsForRole(role);

  return (
    <>
      {open ? <div className={styles.overlay} onClick={onClose} aria-hidden="true" /> : null}
      <aside className={`${styles.sidebar} ${open ? styles.open : ''}`} aria-label="Navegación principal">
        <div className={styles.brand}>
          <GraduationCap size={26} aria-hidden="true" />
          <div>
            <p className={styles.brandName}>SGSSU</p>
            <p className={styles.brandSub}>Servicios universitarios</p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar menú">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <nav className={styles.nav}>
          {sections.map((section) => (
            <div key={section.title} className={styles.section}>
              <p className={styles.sectionTitle}>{section.title}</p>
              <ul className={styles.list}>
                {section.items.map(({ path, label, icon: Icon }) => (
                  <li key={path}>
                    <NavLink
                      to={path}
                      end={path === '/solicitudes'}
                      onClick={onClose}
                      className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span>{label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
