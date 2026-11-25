import { forwardRef } from 'react';
import Spinner from './Spinner.jsx';
import styles from './Button.module.css';

/**
 * Botón del sistema de diseño.
 * variant: primary | secondary | danger | ghost    size: sm | md
 * `loading` deshabilita el botón y muestra el indicador (evita dobles envíos).
 */
const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled = false, icon: Icon, type = 'button', fullWidth = false, className = '', children, ...rest },
  ref,
) {
  const classes = [styles.button, styles[variant], styles[size], fullWidth ? styles.full : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size="sm" label="Procesando…" /> : Icon ? <Icon size={16} aria-hidden="true" /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
});

export default Button;
