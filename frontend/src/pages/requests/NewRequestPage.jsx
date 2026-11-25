import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Alert, Button, Card, Input, PageHeader, Select, Textarea } from '../../components/common/index.js';
import AttachmentPicker from '../../components/requests/AttachmentPicker.jsx';
import { useLoadedList } from '../../hooks/useLoadedList.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { servicesApi } from '../../services/catalog.service.js';
import { requestsApi } from '../../services/requests.service.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

const schema = z.object({
  id_servicio: z.string().min(1, 'Selecciona el servicio que necesitas'),
  asunto: z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1, 'El asunto es obligatorio').max(180, 'El asunto no puede superar 180 caracteres')),
  descripcion: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, 'La descripción es obligatoria').max(4000, 'La descripción no puede superar 4000 caracteres')),
});

const SERVICE_PARAMS = { pageSize: 100 };

export default function NewRequestPage() {
  usePageTitle('Nueva solicitud');
  const navigate = useNavigate();
  const services = useLoadedList(servicesApi.list, SERVICE_PARAMS);
  const [files, setFiles] = useState([]);
  const [serverError, setServerError] = useState(null);

  const {
    register, handleSubmit, setError, watch, formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { id_servicio: '', asunto: '', descripcion: '' } });

  const options = useMemo(
    () => services.items.map((service) => ({ value: String(service.id_servicio), label: `${service.categoria} · ${service.nombre}` })),
    [services.items],
  );
  const selected = services.items.find((service) => String(service.id_servicio) === watch('id_servicio'));

  const onSubmit = async (values) => {
    setServerError(null);
    let created;
    try {
      created = await requestsApi.create({ id_servicio: Number(values.id_servicio), asunto: values.asunto, descripcion: values.descripcion });
    } catch (error) {
      if (!applyServerErrors(error, setError, ['id_servicio', 'asunto', 'descripcion'])) setServerError(errorMessage(error));
      return;
    }

    // La solicitud ya existe: los adjuntos se suben uno a uno y un fallo no la deshace.
    const failures = [];
    for (const file of files) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await requestsApi.uploadAttachment(created.id_solicitud, file);
      } catch (error) {
        failures.push(`${file.name}: ${errorMessage(error)}`);
      }
    }

    toast.success(`Solicitud ${created.codigo} registrada correctamente`);
    if (failures.length > 0) {
      toast.error(`No se pudieron adjuntar ${failures.length} archivo(s). Puedes intentarlo de nuevo desde el detalle. ${failures.join(' · ')}`, { duration: 10000 });
    }
    navigate(`/solicitudes/${created.id_solicitud}`, { replace: true });
  };

  return (
    <>
      <PageHeader title="Nueva solicitud" description="Describe lo que necesitas. Recibirás un código para hacerle seguimiento." />
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '720px' }}>
          {serverError ? <Alert type="error">{serverError}</Alert> : null}
          {services.error ? <Alert type="error">No se pudo cargar el catálogo de servicios. Recarga la página e inténtalo de nuevo.</Alert> : null}

          <Select
            label="Servicio"
            required
            placeholder={services.loading ? 'Cargando servicios…' : 'Selecciona un servicio'}
            options={options}
            error={errors.id_servicio?.message}
            hint={selected ? `Lo atiende ${selected.dependencia}. Tiempo estimado de atención: ${selected.sla_horas} horas.` : undefined}
            {...register('id_servicio')}
          />
          <Input label="Asunto" required maxLength={180} error={errors.asunto?.message} {...register('asunto')} />
          <Textarea label="Descripción" required rows={6} error={errors.descripcion?.message} {...register('descripcion')} />

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>Archivos adjuntos</legend>
            <AttachmentPicker files={files} onChange={setFiles} disabled={isSubmitting} />
          </fieldset>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button variant="secondary" onClick={() => navigate('/solicitudes')} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Registrar solicitud
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
