import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { Card, PageHeader } from '../components/common/index.js';
import { useAuth } from '../hooks/useAuth.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { ROLE_LABELS } from '../utils/navigation.js';
import styles from './ProfilePage.module.css';

/** Datos de la cuenta (solo lectura; los edita el administrador) y acceso al cambio de contraseña. */
export default function ProfilePage() {
  usePageTitle('Mi perfil');
  const { user } = useAuth();

  const rows = [
    ['Nombres', user.nombres],
    ['Apellidos', user.apellidos],
    ['Correo institucional', user.correo],
    ['Perfil', ROLE_LABELS[user.rol] ?? user.rol],
    ['Dependencia', user.dependencia ?? 'No aplica'],
  ];

  return (
    <>
      <PageHeader title="Mi perfil" description="Datos de tu cuenta. Si alguno es incorrecto, solicita la corrección al administrador." />
      <Card
        title="Información de la cuenta"
        actions={
          <Link to="/cambiar-password" className={styles.action}>
            <KeyRound size={16} aria-hidden="true" /> Cambiar contraseña
          </Link>
        }
      >
        <dl className={styles.list}>
          {rows.map(([term, value]) => (
            <div key={term} className={styles.row}>
              <dt className={styles.term}>{term}</dt>
              <dd className={styles.value}>{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
