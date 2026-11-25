import styles from './Reports.module.css';

/** Tarjeta de un indicador. `tone` resalta valores de atención (retraso). */
export default function StatCard({ label, value, hint, tone }) {
  return (
    <div className={`${styles.stat} ${tone === 'danger' ? styles.statDanger : ''}`}>
      <span className={styles.statLabel}>{label}</span>
      <strong className={styles.statValue}>{value}</strong>
      {hint ? <span className={styles.statHint}>{hint}</span> : null}
    </div>
  );
}
