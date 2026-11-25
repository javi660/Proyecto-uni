import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Alert, Button, Modal, PasswordInput } from '../common/index.js';
import { usersApi } from '../../services/users.service.js';
import { passwordRules } from '../../utils/passwordPolicy.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

const schema = z.object({ password_nueva: passwordRules });

/** El administrador define una contraseña temporal; el usuario deberá cambiarla al ingresar. */
export default function ResetPasswordModal({ user, onClose }) {
  return (
    <Modal open={user !== null} onClose={onClose} title="Restablecer contraseña" size="sm">
      {user ? <ResetForm key={user.id_usuario} user={user} onClose={onClose} /> : null}
    </Modal>
  );
}

function ResetForm({ user, onClose }) {
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { password_nueva: '' } });

  const onSubmit = async ({ password_nueva: passwordNueva }) => {
    setServerError('');
    try {
      await usersApi.resetPassword(user.id_usuario, passwordNueva);
      toast.success('Contraseña restablecida. Se cerraron las sesiones del usuario');
      onClose();
    } catch (error) {
      if (!applyServerErrors(error, setError, ['password_nueva'])) setServerError(errorMessage(error));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <p>
        Define una contraseña temporal para <strong>{user.nombres} {user.apellidos}</strong>. Se cerrarán todas sus sesiones y deberá cambiarla en su próximo ingreso.
      </p>
      {serverError ? <Alert type="error">{serverError}</Alert> : null}
      <PasswordInput
        label="Contraseña temporal"
        required
        autoFocus
        autoComplete="new-password"
        hint="Mínimo 10 caracteres, con mayúscula, minúscula y número."
        error={errors.password_nueva?.message}
        {...register('password_nueva')}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Restablecer
        </Button>
      </div>
    </form>
  );
}
