import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Alert, Button, Input, Modal, PasswordInput, Select } from '../common/index.js';
import { usersApi } from '../../services/users.service.js';
import { ROLES } from '../../utils/constants.js';
import { ROLE_LABELS } from '../../utils/navigation.js';
import { passwordRules } from '../../utils/passwordPolicy.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

const ROLE_OPTIONS = Object.values(ROLES).map((value) => ({ value, label: ROLE_LABELS[value] }));
const FIELDS = ['nombres', 'apellidos', 'correo', 'rol', 'id_dependencia', 'password_inicial'];

const baseShape = {
  nombres: z.string().trim().min(1, 'Los nombres son obligatorios').max(100, 'Los nombres no pueden superar 100 caracteres'),
  apellidos: z.string().trim().min(1, 'Los apellidos son obligatorios').max(100, 'Los apellidos no pueden superar 100 caracteres'),
  correo: z.string().trim().min(1, 'El correo es obligatorio').max(150, 'El correo no puede superar 150 caracteres').email('Ingresa un correo válido'),
  rol: z.enum(Object.values(ROLES), { errorMap: () => ({ message: 'Selecciona el perfil' }) }),
  id_dependencia: z.string(),
};

/** Solo el funcionario lleva dependencia (regla del backend); en los demás perfiles se ignora. */
const requireDependency = (values, ctx) => {
  if (values.rol === ROLES.FUNCIONARIO && !values.id_dependencia) {
    ctx.addIssue({ code: 'custom', path: ['id_dependencia'], message: 'Selecciona la dependencia del funcionario' });
  }
};

const createSchema = z.object({ ...baseShape, password_inicial: passwordRules }).superRefine(requireDependency);
const editSchema = z.object(baseShape).superRefine(requireDependency);

/**
 * Alta y edición de usuarios. En el alta el administrador define la contraseña inicial
 * (el usuario deberá cambiarla en su primer ingreso).
 *
 * @param {{open: boolean, record: object|null, dependencies: object[], onClose: () => void, onSaved: () => void}} props
 *        record: null/{} = nuevo; objeto con id_usuario = edición.
 */
export default function UserFormModal({ open, record, dependencies, onClose, onSaved }) {
  const isEdit = Boolean(record?.id_usuario);
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar usuario' : 'Nuevo usuario'}>
      {open ? <UserForm key={record?.id_usuario ?? 'new'} record={record} isEdit={isEdit} dependencies={dependencies} onClose={onClose} onSaved={onSaved} /> : null}
    </Modal>
  );
}

function UserForm({ record, isEdit, dependencies, onClose, onSaved }) {
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: {
      nombres: record?.nombres ?? '',
      apellidos: record?.apellidos ?? '',
      correo: record?.correo ?? '',
      rol: record?.rol ?? ROLES.ESTUDIANTE,
      id_dependencia: record?.id_dependencia ? String(record.id_dependencia) : '',
      password_inicial: '',
    },
  });

  const rol = watch('rol');

  const dependencyOptions = dependencies.map((d) => ({ value: String(d.id_dependencia), label: d.nombre }));
  if (record?.id_dependencia && !dependencyOptions.some((o) => o.value === String(record.id_dependencia))) {
    dependencyOptions.push({ value: String(record.id_dependencia), label: `${record.dependencia} (inactiva)` });
  }

  const onSubmit = async (values) => {
    setServerError('');
    const body = {
      nombres: values.nombres,
      apellidos: values.apellidos,
      correo: values.correo,
      rol: values.rol,
      id_dependencia: values.rol === ROLES.FUNCIONARIO ? Number(values.id_dependencia) : null,
    };
    try {
      if (isEdit) await usersApi.update(record.id_usuario, body);
      else await usersApi.create({ ...body, password_inicial: values.password_inicial });
      toast.success(`Usuario ${isEdit ? 'actualizado' : 'creado'} correctamente`);
      onSaved();
    } catch (error) {
      if (!applyServerErrors(error, setError, FIELDS)) setServerError(errorMessage(error));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {serverError ? <Alert type="error">{serverError}</Alert> : null}
      <Input label="Nombres" required autoFocus autoComplete="off" error={errors.nombres?.message} {...register('nombres')} />
      <Input label="Apellidos" required autoComplete="off" error={errors.apellidos?.message} {...register('apellidos')} />
      <Input label="Correo institucional" type="email" required autoComplete="off" error={errors.correo?.message} {...register('correo')} />
      <Select label="Perfil" required options={ROLE_OPTIONS} error={errors.rol?.message} {...register('rol')} />
      {rol === ROLES.FUNCIONARIO ? (
        <Select
          label="Dependencia"
          required
          placeholder="Selecciona una dependencia"
          options={dependencyOptions}
          hint="El funcionario atiende las solicitudes de los servicios de su dependencia."
          error={errors.id_dependencia?.message}
          {...register('id_dependencia')}
        />
      ) : null}
      {!isEdit ? (
        <PasswordInput
          label="Contraseña inicial"
          required
          autoComplete="new-password"
          hint="Mínimo 10 caracteres, con mayúscula, minúscula y número. El usuario deberá cambiarla al ingresar."
          error={errors.password_inicial?.message}
          {...register('password_inicial')}
        />
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {isEdit ? 'Guardar cambios' : 'Crear usuario'}
        </Button>
      </div>
    </form>
  );
}
