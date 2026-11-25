import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { Alert, Button, PasswordInput } from '../../components/common/index.js';
import { useAuth } from '../../hooks/useAuth.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { passwordRules } from '../../utils/passwordPolicy.js';
import { HOME_PATH } from '../../utils/navigation.js';
import styles from './LoginPage.module.css';

const schema = z
  .object({
    passwordActual: z.string().min(1, 'Ingresa tu contraseña actual'),
    passwordNueva: passwordRules,
    confirmacion: z.string().min(1, 'Confirma la nueva contraseña'),
  })
  .refine((v) => v.passwordNueva === v.confirmacion, { path: ['confirmacion'], message: 'Las contraseñas no coinciden' })
  .refine((v) => v.passwordNueva !== v.passwordActual, { path: ['passwordNueva'], message: 'La nueva contraseña debe ser distinta de la actual' });

/**
 * Cambio de contraseña. Es obligatorio en el primer ingreso (debe_cambiar_password):
 * en ese caso no hay forma de salir sin cambiarla, salvo cerrar la sesión.
 */
export default function ChangePasswordPage() {
  usePageTitle('Cambiar contraseña');
  const { user, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const forced = user.debe_cambiar_password;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { passwordActual: '', passwordNueva: '', confirmacion: '' },
  });

  const onSubmit = async ({ passwordActual, passwordNueva }) => {
    setServerError('');
    try {
      await changePassword({ passwordActual, passwordNueva });
      toast.success('Contraseña actualizada correctamente');
      navigate(HOME_PATH, { replace: true });
    } catch (error) {
      setServerError(error?.message || 'No fue posible cambiar la contraseña');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className={styles.page} style={{ gridTemplateColumns: '1fr' }}>
      <main className={styles.formSide}>
        <form className={styles.card} onSubmit={handleSubmit(onSubmit)} noValidate aria-labelledby="cp-title">
          <div className={styles.header}>
            <KeyRound size={32} className={styles.logo} aria-hidden="true" />
            <h1 id="cp-title" className={styles.title}>
              {forced ? 'Debes cambiar tu contraseña' : 'Cambiar contraseña'}
            </h1>
            <p className={styles.subtitle}>
              {forced ? 'Por seguridad, define una contraseña personal antes de continuar.' : 'Al cambiarla se cerrarán tus otras sesiones.'}
            </p>
          </div>

          {serverError ? <Alert type="error">{serverError}</Alert> : null}

          <PasswordInput label="Contraseña actual" autoComplete="current-password" required error={errors.passwordActual?.message} {...register('passwordActual')} />
          <PasswordInput
            label="Nueva contraseña"
            autoComplete="new-password"
            required
            hint="Mínimo 10 caracteres, con mayúscula, minúscula y número."
            error={errors.passwordNueva?.message}
            {...register('passwordNueva')}
          />
          <PasswordInput label="Confirmar nueva contraseña" autoComplete="new-password" required error={errors.confirmacion?.message} {...register('confirmacion')} />

          <Button type="submit" fullWidth loading={isSubmitting}>
            Guardar contraseña
          </Button>
          {forced ? (
            <Button variant="ghost" fullWidth onClick={handleLogout} disabled={isSubmitting}>
              Cerrar sesión
            </Button>
          ) : (
            <Link to={HOME_PATH} className={styles.help}>
              Cancelar y volver al inicio
            </Link>
          )}
        </form>
      </main>
    </div>
  );
}
