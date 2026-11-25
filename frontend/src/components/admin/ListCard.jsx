import { Alert, Button, Card, DataTable } from '../common/index.js';
import Pagination from './Pagination.jsx';

/**
 * Tarjeta de listado: barra de filtros (children), tabla, error con reintento y paginación.
 * Se usa en todas las pantallas de administración.
 */
export default function ListCard({ toolbar, columns, list, rowKey, emptyTitle, emptyDescription, caption }) {
  return (
    <Card padded={false}>
      {toolbar}
      {list.error ? (
        <div style={{ padding: 'var(--space-4)' }}>
          <Alert type="error" title="No se pudo cargar el listado">
            {list.error.message}{' '}
            <Button variant="secondary" size="sm" onClick={list.reload}>
              Reintentar
            </Button>
          </Alert>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={list.items}
          rowKey={rowKey}
          loading={list.loading && list.items.length === 0}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          caption={caption}
        />
      )}
      <Pagination meta={list.meta} onPageChange={list.setPage} />
    </Card>
  );
}
