import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import styles from './Alert.module.css';

const ICONS = { error: AlertCircle, success: CheckCircle2, info: Info, warning: TriangleAlert };

/** Mensaje en línea. type: error | success | info | warning. Los errores se anuncian a lectores de pantalla. */
export default function Alert({ type = 'info', title, children }) {
  const Icon = ICONS[type] ?? Info;
  return (
    <div className={`${styles.alert} ${styles[type]}`} role={type === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" className={styles.icon} />
      <div>
        {title ? <p className={styles.title}>{title}</p> : null}
        {children ? <div className={styles.text}>{children}</div> : null}
      </div>
    </div>
  );
}
