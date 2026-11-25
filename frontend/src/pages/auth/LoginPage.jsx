import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { GraduationCap } from 'lucide-react';
import { Alert, Button, Input, PasswordInput } from '../../components/common/index.js';
import { useAuth } from '../../hooks/useAuth.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { HOME_PATH } from '../../utils/navigation.js';
import { CHANGE_PASSWORD_PATH } from '../../routes/guards.jsx';
import styles from './LoginPage.module.css';

const schema = z.object({
  correo: z.string().trim().min(1, 'Ingresa tu correo institucional').email('Ingresa un correo válido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});

/** Ruta interna segura a la que volver tras iniciar sesión (nunca una URL externa). */
function safeRedirect(from) {
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/login' ? from : HOME_PATH;
}

export default function LoginPage() {
  usePageTitle('Iniciar sesión');
  const { login, sessionExpired, clearSessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { correo: '', password: '' } });

  const onSubmit = async (values) => {
    setServerError('');
    clearSessionExpired();
    try {
      const user = await login(values);
      navigate(user.debe_cambiar_password ? CHANGE_PASSWORD_PATH : safeRedirect(location.state?.from), { replace: true });
    } catch (error) {
      setServerError(error?.message || 'No fue posible iniciar sesión. Inténtalo de nuevo');
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-hidden="true">
        <GraduationCap size={56} />
        <h2 className={styles.heroTitle}>Servicios y solicitudes universitarias</h2>
        <p className={styles.heroText}>Registra, asigna y haz seguimiento de tus solicitudes en un solo lugar.</p>
      </section>

      <main className={styles.formSide}>
        <form className={styles.card} onSubmit={handleSubmit(onSubmit)} noValidate aria-labelledby="login-title">
          <div className={styles.header}>
            <GraduationCap size={32} className={styles.logo} aria-hidden="true" />
            <h1 id="login-title" className={styles.title}>
              Iniciar sesión
            </h1>
            <p className={styles.subtitle}>Ingresa con tu cuenta institucional</p>
          </div>

          {sessionExpired ? <Alert type="warning">Tu sesión expiró. Inicia sesión nuevamente.</Alert> : null}
          {serverError ? <Alert type="error">{serverError}</Alert> : null}

          <Input
            label="Correo institucional"
            type="email"
            autoComplete="username"
            inputMode="email"
            placeholder="nombre@universidad.edu"
            required
            error={errors.correo?.message}
            {...register('correo')}
          />
          <PasswordInput
            label="Contraseña"
            autoComplete="current-password"
            required
            error={errors.password?.message}
            {...register('password')}
          />

          <Button type="submit" fullWidth loading={isSubmitting}>
            Ingresar
          </Button>
          <p className={styles.help}>¿No tienes cuenta o olvidaste tu contraseña? Comunícate con el administrador del sistema.</p>
        </form>
      </main>
    </div>
  );
}
