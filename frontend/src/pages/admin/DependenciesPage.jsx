import SimpleCatalogPage from '../../components/admin/SimpleCatalogPage.jsx';
import { dependenciesApi } from '../../services/catalog.service.js';

export default function DependenciesPage() {
  return (
    <SimpleCatalogPage
      title="Dependencias"
      description="Áreas de la universidad que atienden los servicios. Un funcionario pertenece a una dependencia."
      singular="dependencia"
      idKey="id_dependencia"
      nameMax={120}
      api={dependenciesApi}
    />
  );
}
