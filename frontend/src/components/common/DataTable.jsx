import Spinner from './Spinner.jsx';
import EmptyState from './EmptyState.jsx';
import styles from './DataTable.module.css';

/**
 * Tabla de datos con estados de carga y vacío.
 *
 * @param {{columns: Array<{key: string, header: string, render?: (row: object) => any, align?: 'left'|'right'|'center', width?: string}>,
 *          rows: object[], rowKey: (row: object) => string|number, loading?: boolean,
 *          emptyTitle?: string, emptyDescription?: string, caption?: string,
 *          onRowClick?: (row: object) => void}} props
 */
export default function DataTable({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle = 'Sin resultados',
  emptyDescription,
  caption,
  onRowClick,
}) {
  if (loading) {
    return (
      <div className={styles.state}>
        <Spinner label="Cargando datos…" />
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        {caption ? <caption className={styles.caption}>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" style={{ width: column.width, textAlign: column.align || 'left' }}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? styles.clickable : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter') onRowClick(row);
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} style={{ textAlign: column.align || 'left' }}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
