import { forwardRef } from 'react';
import FormField from './FormField.jsx';
import styles from './controls.module.css';

/** Área de texto multilínea con etiqueta y error. */
const Textarea = forwardRef(function Textarea({ label, error, hint, required, className = '', rows = 4, ...rest }, ref) {
  return (
    <FormField label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          className={`${styles.control} ${styles.textarea} ${invalid ? styles.invalid : ''} ${className}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          {...rest}
        />
      )}
    </FormField>
  );
});

export default Textarea;
