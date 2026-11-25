import SimpleCatalogPage from '../../components/admin/SimpleCatalogPage.jsx';
import { categoriesApi } from '../../services/catalog.service.js';

export default function CategoriesPage() {
  return (
    <SimpleCatalogPage
      title="Categorías"
      description="Agrupan los servicios del catálogo (por ejemplo, Académico o Bienestar)."
      singular="categoría"
      idKey="id_categoria"
      nameMax={100}
      api={categoriesApi}
    />
  );
}
