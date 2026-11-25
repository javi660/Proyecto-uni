import styles from './Card.module.css';

/** Tarjeta contenedora. `title` y `actions` son opcionales. */
export default function Card({ title, actions, children, padded = true, className = '' }) {
  return (
    <section className={`${styles.card} ${className}`}>
      {title || actions ? (
        <header className={styles.header}>
          {title ? <h2 className={styles.title}>{title}</h2> : <span />}
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      ) : null}
      <div className={padded ? styles.body : undefined}>{children}</div>
    </section>
  );
}
