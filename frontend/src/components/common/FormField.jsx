import { useId } from 'react';
import styles from './FormField.module.css';

/**
 * Contenedor de un campo de formulario: etiqueta, ayuda y mensaje de error accesibles.
 * Los controles (Input, Select, Textarea) lo usan y reciben los ids a enlazar.
 *
 * @param {{label: string, error?: string, hint?: string, required?: boolean,
 *          children: (ids: {id: string, describedBy?: string, invalid: boolean}) => import('react').ReactNode}} props
 */
export default function FormField({ label, error, hint, required = false, children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required ? <span className={styles.required} aria-hidden="true"> *</span> : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
