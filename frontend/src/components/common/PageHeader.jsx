import styles from './PageHeader.module.css';

/** Encabezado estándar de cada pantalla: título, descripción y acciones a la derecha. */
export default function PageHeader({ title, description, actions }) {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
