import Spinner from './Spinner.jsx';
import styles from './FullPageSpinner.module.css';

/** Pantalla completa con indicador de carga (verificación de sesión, carga inicial). */
export default function FullPageSpinner({ label = 'Cargando…' }) {
  return (
    <div className={styles.wrapper}>
      <Spinner size="lg" label={label} />
      <p className={styles.text} aria-hidden="true">
        {label}
      </p>
    </div>
  );
}
