import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Alert, Button, Modal, Select, Textarea } from '../common/index.js';
import { useLoadedList } from '../../hooks/useLoadedList.js';
import { officialsApi, requestsApi } from '../../services/requests.service.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';
import { assignActionLabel } from '../../utils/assignments.js';

const schema = z.object({
  id_funcionario: z.string().min(1, 'Selecciona un funcionario'),
  observacion: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(500, 'La observación no puede superar 500 caracteres')),
});

/**
 * Asignar / reasignar una solicitud. Lista solo funcionarios activos de la dependencia que atiende el servicio
 * (el servidor lo vuelve a validar) y excluye al responsable actual.
 *
 * @param {{request: object, onClose: () => void, onAssigned: (updated: object) => void}} props
 */
export default function AssignModal({ request, onClose, onAssigned }) {
  const reassign = Boolean(request.id_funcionario);
  const label = assignActionLabel(request);
  const params = useMemo(() => ({ id_dependencia: request.id_dependencia, pageSize: 100 }), [request.id_dependencia]);
  const officials = useLoadedList(officialsApi.list, params);
  const [serverError, setServerError] = useState(null);

  const candidates = officials.items.filter((official) => official.id_usuario !== request.id_funcionario);
  const options = candidates.map((official) => ({
    value: String(official.id_usuario),
    label: `${official.nombres} ${official.apellidos} · ${official.carga_activa} ${official.carga_activa === 1 ? 'solicitud activa' : 'solicitudes activas'}`,
  }));

  const {
    register, handleSubmit, setError, formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { id_funcionario: '', observacion: '' } });

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      const updated = await requestsApi.assign(request.id_solicitud, {
        id_funcionario: Number(values.id_funcionario),
        observacion: values.observacion || null,
      });
      toast.success(reassign ? 'Solicitud reasignada correctamente' : 'Solicitud asignada correctamente');
      onAssigned(updated);
    } catch (error) {
      if (!applyServerErrors(error, setError, ['id_funcionario', 'observacion'])) setServerError(errorMessage(error));
    }
  };

  const noCandidates = !officials.loading && !officials.error && candidates.length === 0;

  return (
    <Modal
      open
      title={`${label} solicitud`}
      onClose={isSubmitting ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="assign-form" loading={isSubmitting} disabled={officials.loading || noCandidates}>
            {label}
          </Button>
        </>
      }
    >
      <form id="assign-form" onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
          {request.codigo} · {request.asunto}
        </p>
        {serverError ? <Alert type="error">{serverError}</Alert> : null}
        {officials.error ? <Alert type="error">No se pudo cargar la lista de funcionarios.</Alert> : null}
        {noCandidates ? (
          <Alert type="warning">
            No hay otros funcionarios activos en {request.dependencia}. Un administrador debe crear o activar funcionarios de esa dependencia.
          </Alert>
        ) : null}
        {reassign ? <Alert type="info">Actualmente la atiende {request.funcionario}. Al reasignar, se le notificará a él, a la persona nueva y al estudiante.</Alert> : null}

        <Select
          label="Funcionario"
          required
          placeholder={officials.loading ? 'Cargando funcionarios…' : 'Selecciona un funcionario'}
          options={options}
          error={errors.id_funcionario?.message}
          hint={`Dependencia: ${request.dependencia}`}
          {...register('id_funcionario')}
        />
        <Textarea label="Observación (opcional)" rows={3} maxLength={500} error={errors.observacion?.message} {...register('observacion')} />
      </form>
    </Modal>
  );
}
