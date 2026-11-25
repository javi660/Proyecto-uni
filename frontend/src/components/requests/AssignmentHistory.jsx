import { Badge } from '../common/index.js';
import { formatDateTime } from '../../utils/format.js';
import styles from './RequestComponents.module.css';

/** Historial de asignaciones de una solicitud (la más reciente primero). */
export default function AssignmentHistory({ assignments }) {
  if (assignments.length === 0) return <p className={styles.empty}>Aún no ha sido asignada a ningún funcionario.</p>;
  return (
    <ol className={styles.fileList} aria-label="Historial de asignaciones">
      {assignments.map((item) => (
        <li key={item.id_asignacion} className={styles.fileItem} style={{ alignItems: 'flex-start' }}>
          <span>
            <strong>{item.funcionario}</strong>{' '}
            {item.activo ? <Badge color="var(--color-success, #198754)">Actual</Badge> : null}
            <div className={styles.fileMeta} style={{ whiteSpace: 'normal' }}>
              {item.asignador ? `Asignada por ${item.asignador} el ` : 'Asignada el '}{formatDateTime(item.asignado_en)}
              {item.finalizado_en ? ` · hasta ${formatDateTime(item.finalizado_en)}` : ''}
            </div>
            {item.observacion ? <div style={{ marginTop: 'var(--space-1)' }}>{item.observacion}</div> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
