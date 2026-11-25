import { forwardRef } from 'react';
import FormField from './FormField.jsx';
import styles from './controls.module.css';

/** Campo de texto con etiqueta y error. Compatible con react-hook-form (`{...register('campo')}`). */
const Input = forwardRef(function Input({ label, error, hint, required, className = '', ...rest }, ref) {
  return (
    <FormField label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <input
          ref={ref}
          id={id}
          className={`${styles.control} ${invalid ? styles.invalid : ''} ${className}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          {...rest}
        />
      )}
    </FormField>
  );
});

export default Input;
