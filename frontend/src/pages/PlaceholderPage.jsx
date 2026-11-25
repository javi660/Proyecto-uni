import { Construction } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '../components/common/index.js';
import { usePageTitle } from '../hooks/usePageTitle.js';

/** Pantalla de un módulo cuyo contenido se construye en una fase posterior del plan. */
export default function PlaceholderPage({ title, description, phase }) {
  usePageTitle(title);
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <EmptyState
          icon={Construction}
          title="Módulo en construcción"
          description={`Esta pantalla se habilitará en la Fase ${phase} del desarrollo. La navegación y los permisos de tu perfil ya están activos.`}
        />
      </Card>
    </>
  );
}
