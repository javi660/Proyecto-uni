import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, Button, Select, Textarea } from '../common/index.js';
import { requestsApi } from '../../services/requests.service.js';
import { errorMessage } from '../../utils/formErrors.js';

const VISIBILITY_OPTIONS = [
  { value: 'PUBLICA', label: 'Pública (la ve el estudiante y se le notifica)' },
  { value: 'INTERNA', label: 'Interna (solo personal)' },
];

/** Formulario para que el funcionario asignado publique una respuesta pública o una nota interna. */
export default function ResponseForm({ idSolicitud, onAdded }) {
  const [contenido, setContenido] = useState('');
  const [visibilidad, setVisibilidad] = useState('PUBLICA');
  const [fieldError, setFieldError] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const text = contenido.trim();
    setServerError(null);
    if (!text) { setFieldError('Escribe el contenido de la respuesta'); return; }
    if (text.length > 4000) { setFieldError('La respuesta no puede superar 4000 caracteres'); return; }
    setFieldError(null);
    setSaving(true);
    try {
      await requestsApi.addResponse(idSolicitud, { contenido: text, visibilidad });
      toast.success(visibilidad === 'PUBLICA' ? 'Respuesta publicada' : 'Nota interna guardada');
      setContenido('');
      await onAdded();
    } catch (error) {
      setServerError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }} aria-label="Nueva respuesta">
      {serverError ? <Alert type="error">{serverError}</Alert> : null}
      <Textarea label="Nueva respuesta" rows={3} maxLength={4000} value={contenido} onChange={(e) => setContenido(e.target.value)} error={fieldError} />
      <Select label="Visibilidad" options={VISIBILITY_OPTIONS} value={visibilidad} onChange={(e) => setVisibilidad(e.target.value)} />
      <div><Button type="submit" loading={saving}>Publicar</Button></div>
    </form>
  );
}
