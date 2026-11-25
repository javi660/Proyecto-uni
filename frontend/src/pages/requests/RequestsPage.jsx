import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, UserPlus } from 'lucide-react';
import { Button, PageHeader, PriorityBadge, Select, StatusBadge, Input } from '../../components/common/index.js';
import ListToolbar from '../../components/admin/ListToolbar.jsx';
import ListCard from '../../components/admin/ListCard.jsx';
import { usePagedList } from '../../hooks/usePagedList.js';
import { useLoadedList } from '../../hooks/useLoadedList.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { useAuth } from '../../hooks/useAuth.js';
import { dependenciesApi } from '../../services/catalog.service.js';
import { requestsApi } from '../../services/requests.service.js';
import { STATE_META, PRIORITY_META } from '../../utils/statusColors.js';
import { formatDateTime } from '../../utils/format.js';

const STATE_OPTIONS = Object.entries(STATE_META).map(([value, meta]) => ({ value, label: meta.label }));
const PRIORITY_OPTIONS = Object.entries(PRIORITY_META).map(([value, meta]) => ({ value, label: meta.label }));
const DEPENDENCY_PARAMS = { activo: true, pageSize: 100 };

const DESCRIPTIONS = {
  ESTUDIANTE: 'Consulta el estado de las solicitudes que has registrado.',
  FUNCIONARIO: 'Solicitudes que tienes a tu cargo.',
  SUPERVISOR: 'Solicitudes de las dependencias que supervisas.',
  ADMINISTRADOR: 'Todas las solicitudes del sistema.',
};

/** Listado de solicitudes. El servidor limita los resultados al alcance del perfil. */
export default function RequestsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isStudent = user.rol === 'ESTUDIANTE';
  const canFilterByDependency = user.rol === 'ADMINISTRADOR' || user.rol === 'SUPERVISOR';
  const title = isStudent ? 'Mis solicitudes' : user.rol === 'FUNCIONARIO' ? 'Mis asignaciones' : 'Solicitudes';
  usePageTitle(title);

  const list = usePagedList(requestsApi.list);
  const { updateFilters } = list;
  const dependencies = useLoadedList(dependenciesApi.list, DEPENDENCY_PARAMS, { enabled: canFilterByDependency });
  const onSearch = useCallback((q) => updateFilters({ q: q || undefined }), [updateFilters]);
  const set = (key) => (event) => updateFilters({ [key]: event.target.value || undefined });

  const columns = [
    {
      key: 'codigo',
      header: 'Código',
      width: '150px',
      render: (row) => <Link to={`/solicitudes/${row.id_solicitud}`}>{row.codigo}</Link>,
    },
    {
      key: 'asunto',
      header: 'Asunto',
      render: (row) => (
        <>
          <strong>{row.asunto}</strong>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            {row.servicio} · {row.dependencia}
          </div>
        </>
      ),
    },
    ...(isStudent ? [] : [{ key: 'estudiante', header: 'Estudiante' }]),
    ...(user.rol === 'FUNCIONARIO' ? [] : [{ key: 'funcionario', header: 'Atiende', render: (row) => row.funcionario ?? 'Sin asignar' }]),
    { key: 'estado', header: 'Estado', render: (row) => <StatusBadge status={row.estado} /> },
    { key: 'prioridad', header: 'Prioridad', render: (row) => <PriorityBadge priority={row.prioridad} /> },
    { key: 'fecha_registro', header: 'Registro', render: (row) => formatDateTime(row.fecha_registro) },
  ];

  return (
    <>
      <PageHeader
        title={title}
        description={DESCRIPTIONS[user.rol]}
        actions={
          isStudent ? (
            <Button icon={Plus} onClick={() => navigate('/solicitudes/nueva')}>
              Nueva solicitud
            </Button>
          ) : null
        }
      />
      <ListCard
        list={list}
        columns={columns}
        rowKey={(row) => row.id_solicitud}
        caption={title}
        emptyTitle={isStudent ? 'Aún no tienes solicitudes' : 'No hay solicitudes para mostrar'}
        emptyDescription={isStudent ? 'Registra tu primera solicitud con el botón "Nueva solicitud".' : 'Ajusta los filtros para ampliar la búsqueda.'}
        toolbar={
          <ListToolbar searchLabel="Buscar solicitud" searchPlaceholder="Buscar por código, asunto o estudiante…" onSearch={onSearch}>
            {canFilterByDependency ? (
              <Button variant={list.filters.estado === 'REGISTRADA' ? 'primary' : 'secondary'} icon={UserPlus} onClick={() => updateFilters({ estado: list.filters.estado === 'REGISTRADA' ? undefined : 'REGISTRADA' })} aria-pressed={list.filters.estado === 'REGISTRADA'}>
                Por asignar
              </Button>
            ) : null}
            <Select label="Estado" placeholder="Todos" options={STATE_OPTIONS} value={list.filters.estado ?? ''} onChange={set('estado')} />
            <Select label="Prioridad" placeholder="Todas" options={PRIORITY_OPTIONS} value={list.filters.prioridad ?? ''} onChange={set('prioridad')} />
            {canFilterByDependency ? (
              <Select
                label="Dependencia"
                placeholder="Todas"
                options={dependencies.items.map((d) => ({ value: String(d.id_dependencia), label: d.nombre }))}
                value={list.filters.id_dependencia ?? ''}
                onChange={set('id_dependencia')}
              />
            ) : null}
            <Input label="Desde" type="date" value={list.filters.desde ?? ''} max={list.filters.hasta || undefined} onChange={set('desde')} />
            <Input label="Hasta" type="date" value={list.filters.hasta ?? ''} min={list.filters.desde || undefined} onChange={set('hasta')} />
          </ListToolbar>
        }
      />
    </>
  );
}
