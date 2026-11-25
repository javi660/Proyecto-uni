import { Inbox } from 'lucide-react';
import styles from './EmptyState.module.css';

/** Estado vacío: lista sin resultados o módulo aún sin datos. `action` es un botón opcional. */
export default function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className={styles.empty}>
      <Icon size={40} aria-hidden="true" className={styles.icon} />
      <h3 className={styles.title}>{title}</h3>
      {description ? <p className={styles.text}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
