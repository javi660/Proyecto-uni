import { Badge, StatusBadge } from '../common/index.js';
import { formatDateTime } from '../../utils/format.js';
import styles from './RequestComponents.module.css';

const ROLE_LABELS = { ESTUDIANTE: 'Estudiante', FUNCIONARIO: 'Funcionario', SUPERVISOR: 'Supervisor', ADMINISTRADOR: 'Administrador' };

/** Línea de tiempo cronológica (más antigua primero): cambios de estado y respuestas. */
export default function Timeline({ events }) {
  if (!events || events.length === 0) return <p className={styles.empty}>Aún no hay actividad registrada.</p>;
  return (
    <ol className={styles.timeline} aria-label="Línea de tiempo">
      {events.map((event) => (
        <li key={event.id} className={styles.timelineItem}>
          <div className={styles.timelineHead}>
            {event.tipo === 'ESTADO' ? (
              <>
                {event.estado_anterior ? <><StatusBadge status={event.estado_anterior} /><span aria-hidden="true">→</span></> : null}
                <StatusBadge status={event.estado_nuevo} />
              </>
            ) : (
              <strong>Respuesta</strong>
            )}
            {event.tipo === 'RESPUESTA' && event.visibilidad === 'INTERNA' ? <Badge color="var(--color-warning, #b7791f)">Interna</Badge> : null}
          </div>
          <div className={styles.fileMeta} style={{ whiteSpace: 'normal' }}>
            {event.usuario ?? 'Sistema'}{event.rol_usuario ? ` (${ROLE_LABELS[event.rol_usuario] ?? event.rol_usuario})` : ''} · {formatDateTime(event.fecha)}
          </div>
          {event.tipo === 'RESPUESTA' ? <p className={styles.timelineText}>{event.contenido}</p> : null}
          {event.tipo === 'ESTADO' && event.observacion ? <p className={styles.timelineText}>{event.observacion}</p> : null}
        </li>
      ))}
    </ol>
  );
}
