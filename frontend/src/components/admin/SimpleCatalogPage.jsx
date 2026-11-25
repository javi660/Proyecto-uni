import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Alert, Button, ConfirmDialog, Input, Modal, PageHeader, Textarea } from '../common/index.js';
import ListToolbar from './ListToolbar.jsx';
import ListCard from './ListCard.jsx';
import ActiveBadge from './ActiveBadge.jsx';
import ActiveFilter from './ActiveFilter.jsx';
import { usePagedList } from '../../hooks/usePagedList.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

/**
 * Pantalla de administración de un catálogo simple (nombre + descripción + estado).
 * Sirve para dependencias y categorías: solo cambian la configuración.
 *
 * @param {{title: string, description: string, singular: string, feminine?: boolean, idKey: string,
 *          nameMax: number, api: object}} props
 */
export default function SimpleCatalogPage({ title, description, singular, feminine = true, idKey, nameMax, api }) {
  usePageTitle(title);
  const list = usePagedList(api.list);
  const [editing, setEditing] = useState(null); // null = cerrado, {} = nuevo, objeto = edición
  const [toggling, setToggling] = useState(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const art = feminine ? { nuevo: 'Nueva', creado: 'creada', actualizado: 'actualizada', desactivado: 'desactivada', activado: 'activada' } : { nuevo: 'Nuevo', creado: 'creado', actualizado: 'actualizado', desactivado: 'desactivado', activado: 'activado' };
  const { updateFilters } = list;
  const onSearch = useCallback((q) => updateFilters({ q: q || undefined }), [updateFilters]);

  const confirmToggle = async () => {
    setToggleBusy(true);
    try {
      await api.setStatus(toggling[idKey], !toggling.activo);
      toast.success(`${singular[0].toUpperCase()}${singular.slice(1)} ${toggling.activo ? art.desactivado : art.activado}`);
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
    { key: 'nombre', header: 'Nombre', render: (row) => <strong>{row.nombre}</strong> },
    { key: 'descripcion', header: 'Descripción', render: (row) => row.descripcion || <span style={{ color: 'var(--color-text-muted)' }}>—</span> },
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
        title={title}
        description={description}
        actions={
          <Button icon={Plus} onClick={() => setEditing({})}>
            {art.nuevo} {singular}
          </Button>
        }
      />

      <ListCard
        list={list}
        columns={columns}
        rowKey={(row) => row[idKey]}
        emptyTitle={`No hay ${singular === 'categoría' ? 'categorías' : 'dependencias'} para mostrar`}
        emptyDescription="Ajusta los filtros o crea un registro nuevo."
        toolbar={
          <ListToolbar searchLabel={`Buscar ${singular}`} searchPlaceholder="Buscar por nombre o descripción…" onSearch={onSearch}>
            <ActiveFilter value={list.filters.activo} onChange={(activo) => updateFilters({ activo })} />
          </ListToolbar>
        }
      />

      <CatalogFormModal
        open={editing !== null}
        record={editing}
        singular={singular}
        art={art}
        idKey={idKey}
        nameMax={nameMax}
        api={api}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          list.reload();
        }}
      />

      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.activo ? `¿Desactivar ${singular}?` : `¿Activar ${singular}?`}
        message={
          toggling?.activo
            ? `"${toggling?.nombre}" dejará de estar disponible. Si tiene registros activos asociados, el sistema no permitirá desactivarla.`
            : `"${toggling?.nombre}" volverá a estar disponible.`
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

function CatalogFormModal({ open, record, singular, art, idKey, nameMax, api, onClose, onSaved }) {
  const isEdit = Boolean(record && record[idKey]);
  const schema = z.object({
    nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(nameMax, `El nombre no puede superar ${nameMax} caracteres`),
    descripcion: z.string().trim().max(1000, 'La descripción no puede superar 1000 caracteres'),
  });

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Editar ${singular}` : `${art.nuevo} ${singular}`} footer={null}>
      {open ? <CatalogForm key={record?.[idKey] ?? 'new'} schema={schema} record={record} isEdit={isEdit} singular={singular} art={art} idKey={idKey} api={api} onClose={onClose} onSaved={onSaved} /> : null}
    </Modal>
  );
}

function CatalogForm({ schema, record, isEdit, singular, art, idKey, api, onClose, onSaved }) {
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { nombre: record?.nombre ?? '', descripcion: record?.descripcion ?? '' } });

  const onSubmit = async (values) => {
    setServerError('');
    const body = { nombre: values.nombre, descripcion: values.descripcion || null };
    try {
      if (isEdit) await api.update(record[idKey], body);
      else await api.create(body);
      toast.success(`${singular[0].toUpperCase()}${singular.slice(1)} ${isEdit ? art.actualizado : art.creado} correctamente`);
      onSaved();
    } catch (error) {
      if (!applyServerErrors(error, setError, ['nombre', 'descripcion'])) setServerError(errorMessage(error));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {serverError ? <Alert type="error">{serverError}</Alert> : null}
      <Input label="Nombre" required autoFocus error={errors.nombre?.message} {...register('nombre')} />
      <Textarea label="Descripción" rows={3} hint="Opcional" error={errors.descripcion?.message} {...register('descripcion')} />
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
