import styles from './Spinner.module.css';

/** Indicador de carga. `label` es el texto para lectores de pantalla. */
export default function Spinner({ size = 'md', label = 'Cargando…' }) {
  return (
    <span className={`${styles.spinner} ${styles[size]}`} role="status" aria-live="polite">
      <span className={styles.circle} aria-hidden="true" />
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
}
