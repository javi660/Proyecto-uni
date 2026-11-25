import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Alert, Button, ConfirmDialog, Input, Modal, PageHeader, Select, Textarea } from '../../components/common/index.js';
import ListToolbar from '../../components/admin/ListToolbar.jsx';
import ListCard from '../../components/admin/ListCard.jsx';
import ActiveBadge from '../../components/admin/ActiveBadge.jsx';
import ActiveFilter from '../../components/admin/ActiveFilter.jsx';
import { usePagedList } from '../../hooks/usePagedList.js';
import { useLoadedList } from '../../hooks/useLoadedList.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { categoriesApi, dependenciesApi, servicesApi } from '../../services/catalog.service.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

const schema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(150, 'El nombre no puede superar 150 caracteres'),
  descripcion: z.string().trim().max(1000, 'La descripción no puede superar 1000 caracteres'),
  id_categoria: z.string().min(1, 'Selecciona la categoría'),
  id_dependencia: z.string().min(1, 'Selecciona la dependencia'),
  sla_horas: z
    .string()
    .trim()
    .min(1, 'Indica el tiempo de atención en horas')
    .refine((v) => /^\d+$/.test(v), 'Debe ser un número entero de horas')
    .refine((v) => Number(v) >= 1, 'Debe ser de al menos 1 hora')
    .refine((v) => Number(v) <= 8760, 'No puede superar 8760 horas (1 año)'),
});

const ACTIVE_PARAMS = { activo: true, pageSize: 100 };

/** Opciones de un desplegable: los activos, más el valor actual aunque esté inactivo (al editar). */
function buildOptions(items, idKey, currentId, currentName) {
  const options = items.map((item) => ({ value: String(item[idKey]), label: item.nombre }));
  if (currentId && !options.some((o) => o.value === String(currentId))) {
    options.push({ value: String(currentId), label: `${currentName} (inactiva)` });
  }
  return options;
}

export default function ServicesPage() {
  usePageTitle('Servicios');
  const list = usePagedList(servicesApi.list);
  const categories = useLoadedList(categoriesApi.list, ACTIVE_PARAMS);
  const dependencies = useLoadedList(dependenciesApi.list, ACTIVE_PARAMS);
  const [editing, setEditing] = useState(null);
  const [toggling, setToggling] = useState(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const { updateFilters } = list;
  const onSearch = useCallback((q) => updateFilters({ q: q || undefined }), [updateFilters]);

  const confirmToggle = async () => {
    setToggleBusy(true);
    try {
      await servicesApi.setStatus(toggling.id_servicio, !toggling.activo);
      toast.success(`Servicio ${toggling.activo ? 'desactivado' : 'activado'}`);
      setToggling(null);
      list.reload();
    } catch (error) {
      toast.error(errorMessage(error));
      setToggling(null);
    } finally {
      setToggleBusy(false);
    }
  };

  const columns = [
    {
      key: 'nombre',
      header: 'Servicio',
      render: (row) => (
        <div>
          <strong>{row.nombre}</strong>
          {row.descripcion ? <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>{row.descripcion}</p> : null}
        </div>
      ),
    },
    { key: 'categoria', header: 'Categoría' },
    { key: 'dependencia', header: 'Dependencia' },
    { key: 'sla_horas', header: 'SLA (horas)', align: 'right', width: '110px' },
    { key: 'activo', header: 'Estado', width: '110px', render: (row) => <ActiveBadge active={row.activo} /> },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      width: '220px',
      render: (row) => (
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <Button size="sm" variant="secondary" onClick={() => setEditing(row)} aria-label={`Editar ${row.nombre}`}>
            Editar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setToggling(row)} aria-label={`${row.activo ? 'Desactivar' : 'Activar'} ${row.nombre}`}>
            {row.activo ? 'Desactivar' : 'Activar'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Servicios"
        description="Catálogo de servicios que los estudiantes pueden solicitar, con su dependencia responsable y su tiempo de atención (SLA)."
        actions={
          <Button icon={Plus} onClick={() => setEditing({})}>
            Nuevo servicio
          </Button>
        }
      />

      <ListCard
        list={list}
        columns={columns}
        rowKey={(row) => row.id_servicio}
        emptyTitle="No hay servicios para mostrar"
        emptyDescription="Ajusta los filtros o crea un servicio nuevo."
        toolbar={
          <ListToolbar searchLabel="Buscar servicio" searchPlaceholder="Buscar por nombre o descripción…" onSearch={onSearch}>
            <Select
              label="Categoría"
              placeholder="Todas"
              options={categories.items.map((c) => ({ value: String(c.id_categoria), label: c.nombre }))}
              value={list.filters.id_categoria ?? ''}
              onChange={(e) => updateFilters({ id_categoria: e.target.value || undefined })}
            />
            <Select
              label="Dependencia"
              placeholder="Todas"
              options={dependencies.items.map((d) => ({ value: String(d.id_dependencia), label: d.nombre }))}
              value={list.filters.id_dependencia ?? ''}
              onChange={(e) => updateFilters({ id_dependencia: e.target.value || undefined })}
            />
            <ActiveFilter value={list.filters.activo} onChange={(activo) => updateFilters({ activo })} />
          </ListToolbar>
        }
      />

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id_servicio ? 'Editar servicio' : 'Nuevo servicio'} size="md">
        {editing !== null ? (
          <ServiceForm
            key={editing.id_servicio ?? 'new'}
            record={editing}
            categories={categories}
            dependencies={dependencies}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              list.reload();
            }}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.activo ? '¿Desactivar servicio?' : '¿Activar servicio?'}
        message={
          toggling?.activo
            ? `"${toggling?.nombre}" dejará de poder solicitarse. Las solicitudes ya registradas continúan su trámite.`
            : `"${toggling?.nombre}" volverá a poder solicitarse (requiere categoría y dependencia activas).`
        }
        confirmLabel={toggling?.activo ? 'Desactivar' : 'Activar'}
        danger={Boolean(toggling?.activo)}
        loading={toggleBusy}
        onConfirm={confirmToggle}
        onCancel={() => setToggling(null)}
      />
    </>
  );
}

function ServiceForm({ record, categories, dependencies, onClose, onSaved }) {
  const isEdit = Boolean(record.id_servicio);
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: record.nombre ?? '',
      descripcion: record.descripcion ?? '',
      id_categoria: record.id_categoria ? String(record.id_categoria) : '',
      id_dependencia: record.id_dependencia ? String(record.id_dependencia) : '',
      sla_horas: String(record.sla_horas ?? 72),
    },
  });

  const onSubmit = async (values) => {
    setServerError('');
    const body = {
      nombre: values.nombre,
      descripcion: values.descripcion || null,
      id_categoria: Number(values.id_categoria),
      id_dependencia: Number(values.id_dependencia),
      sla_horas: Number(values.sla_horas),
    };
    try {
      if (isEdit) await servicesApi.update(record.id_servicio, body);
      else await servicesApi.create(body);
      toast.success(`Servicio ${isEdit ? 'actualizado' : 'creado'} correctamente`);
      onSaved();
    } catch (error) {
      if (!applyServerErrors(error, setError, ['nombre', 'descripcion', 'id_categoria', 'id_dependencia', 'sla_horas'])) {
        setServerError(errorMessage(error));
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {serverError ? <Alert type="error">{serverError}</Alert> : null}
      <Input label="Nombre" required autoFocus error={errors.nombre?.message} {...register('nombre')} />
      <Textarea label="Descripción" rows={3} hint="Opcional" error={errors.descripcion?.message} {...register('descripcion')} />
      <Select
        label="Categoría"
        required
        placeholder="Selecciona una categoría"
        options={buildOptions(categories.items, 'id_categoria', record.id_categoria, record.categoria)}
        error={errors.id_categoria?.message}
        {...register('id_categoria')}
      />
      <Select
        label="Dependencia responsable"
        required
        placeholder="Selecciona una dependencia"
        options={buildOptions(dependencies.items, 'id_dependencia', record.id_dependencia, record.dependencia)}
        error={errors.id_dependencia?.message}
        {...register('id_dependencia')}
      />
      <Input
        label="Tiempo de atención (SLA) en horas"
        required
        inputMode="numeric"
        hint="Plazo para atender la solicitud. Por defecto 72 horas."
        error={errors.sla_horas?.message}
        {...register('sla_horas')}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {isEdit ? 'Guardar cambios' : 'Crear'}
        </Button>
      </div>
    </form>
  );
}
