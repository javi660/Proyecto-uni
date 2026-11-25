import { getStateMeta, getPriorityMeta } from '../../utils/statusColors.js';
import styles from './Badge.module.css';

/** Etiqueta de color genérica. `color` es un valor CSS (hex o var()). */
export function Badge({ children, color = 'var(--color-text-muted)' }) {
  return (
    <span className={styles.badge} style={{ '--badge-color': color }}>
      {children}
    </span>
  );
}

/** Estado de una solicitud, con la etiqueta y el color únicos del sistema. */
export function StatusBadge({ status }) {
  const meta = getStateMeta(status);
  return <Badge color={`var(${meta.cssVar}, ${meta.color})`}>{meta.label}</Badge>;
}

/** Prioridad de una solicitud. */
export function PriorityBadge({ priority }) {
  const meta = getPriorityMeta(priority);
  return <Badge color={`var(${meta.cssVar}, ${meta.color})`}>{meta.label}</Badge>;
}

export default Badge;
