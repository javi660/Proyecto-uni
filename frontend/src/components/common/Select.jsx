import { forwardRef } from 'react';
import FormField from './FormField.jsx';
import styles from './controls.module.css';

/**
 * Lista desplegable. `options`: [{ value, label }]. `placeholder` agrega una primera opción vacía.
 */
const Select = forwardRef(function Select({ label, error, hint, required, options = [], placeholder, className = '', ...rest }, ref) {
  return (
    <FormField label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <select
          ref={ref}
          id={id}
          className={`${styles.control} ${invalid ? styles.invalid : ''} ${className}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          {...rest}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
});

export default Select;
