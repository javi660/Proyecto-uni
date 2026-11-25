import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import FormField from './FormField.jsx';
import styles from './controls.module.css';

/** Campo de contraseña con botón para mostrar u ocultar el texto. */
const PasswordInput = forwardRef(function PasswordInput({ label, error, hint, required, className = '', ...rest }, ref) {
  const [visible, setVisible] = useState(false);

  return (
    <FormField label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <div className={styles.passwordWrap}>
          <input
            ref={ref}
            id={id}
            type={visible ? 'text' : 'password'}
            className={`${styles.control} ${invalid ? styles.invalid : ''} ${className}`}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            {...rest}
          />
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={visible}
          >
            {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
      )}
    </FormField>
  );
});

export default PasswordInput;
