import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '../components/common/index.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { HOME_PATH } from '../utils/navigation.js';

/** Se muestra dentro del layout cuando el perfil no tiene acceso a una pantalla. */
export default function ForbiddenPage() {
  usePageTitle('Acceso denegado');
  return (
    <EmptyState
      icon={ShieldAlert}
      title="No tienes acceso a esta sección"
      description="Tu perfil no tiene permisos para ver esta pantalla. Si crees que es un error, comunícate con el administrador."
      action={
        <Link to={HOME_PATH} style={{ fontWeight: 600 }}>
          Volver al inicio
        </Link>
      }
    />
  );
}
