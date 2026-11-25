import { ChevronLeft } from 'lucide-react';
import Button from '../common/Button.jsx';
import styles from './Pagination.module.css';

/**
 * Paginación de un listado. `meta` = { page, pageSize, total } tal como lo entrega la API.
 * No se muestra si todo cabe en una página.
 */
export default function Pagination({ meta, onPageChange }) {
  if (!meta || meta.total === 0) return null;

  const { page, pageSize, total } = meta;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className={styles.pagination} aria-label="Paginación">
      <p className={styles.summary} aria-live="polite">
        Mostrando {from}–{to} de {total}
      </p>
      {totalPages > 1 ? (
        <div className={styles.controls}>
          <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Página anterior">
            Anterior
          </Button>
          <span className={styles.page}>
            Página {page} de {totalPages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Página siguiente">
            Siguiente
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
