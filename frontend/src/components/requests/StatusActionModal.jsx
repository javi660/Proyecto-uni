import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, Button, Modal, Textarea } from '../common/index.js';
import { requestsApi } from '../../services/requests.service.js';
import { errorMessage } from '../../utils/formErrors.js';

const MESSAGES = {
  EN_PROCESO: 'Atención iniciada',
  RESUELTA: 'Solicitud marcada como resuelta',
  CERRADA: 'Solicitud cerrada',
  REABIERTA: 'Solicitud reabierta',
  RECHAZADA: 'Solicitud rechazada',
};

/**
 * Confirmación de un cambio de estado. Pide motivo cuando es obligatorio (rechazar/reabrir) y opcional en el resto.
 *
 * @param {{request: object, action: ReturnType<typeof import('../../utils/workflow.js').availableActions>[number],
 *          onClose: () => void, onDone: (updated: object) => void}} props
 */
export default function StatusActionModal({ request, action, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const text = reason.trim();
    setServerError(null);
    if (action.reasonRequired && !text) {
      setFieldError('El motivo es obligatorio');
      return;
    }
    if (text.length > 1000) {
      setFieldError('El motivo no puede superar 1000 caracteres');
      return;
    }
    setFieldError(null);
    setSaving(true);
    try {
      const updated = await requestsApi.changeStatus(request.id_solicitud, { estado: action.estado, observacion: text || null });
      toast.success(MESSAGES[action.estado] ?? 'Estado actualizado');
      onDone(updated);
    } catch (error) {
      setServerError(errorMessage(error));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={action.label}
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" form="status-form" variant={action.variant === 'danger' ? 'danger' : 'primary'} loading={saving}>
            {action.label}
          </Button>
        </>
      }
    >
      <form id="status-form" onSubmit={submit} noValidate style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>{request.codigo} · {request.asunto}</p>
        <p style={{ margin: 0 }}>{action.description}</p>
        {serverError ? <Alert type="error">{serverError}</Alert> : null}
        <Textarea
          label={action.reasonRequired ? 'Motivo' : 'Comentario (opcional)'}
          required={action.reasonRequired}
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={fieldError}
          hint="Quedará visible en la línea de tiempo."
        />
      </form>
    </Modal>
  );
}
