import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Badge, Button, ConfirmDialog, PageHeader, Select } from '../../components/common/index.js';
import ListToolbar from '../../components/admin/ListToolbar.jsx';
import ListCard from '../../components/admin/ListCard.jsx';
import ActiveBadge from '../../components/admin/ActiveBadge.jsx';
import ActiveFilter from '../../components/admin/ActiveFilter.jsx';
import UserFormModal from '../../components/admin/UserFormModal.jsx';
import ResetPasswordModal from '../../components/admin/ResetPasswordModal.jsx';
import SupervisionModal from '../../components/admin/SupervisionModal.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { usePagedList } from '../../hooks/usePagedList.js';
import { useLoadedList } from '../../hooks/useLoadedList.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { usersApi } from '../../services/users.service.js';
import { dependenciesApi } from '../../services/catalog.service.js';
import { ROLES } from '../../utils/constants.js';
import { ROLE_LABELS } from '../../utils/navigation.js';
import { errorMessage } from '../../utils/formErrors.js';

const ROLE_FILTER_OPTIONS = Object.values(ROLES).map((value) => ({ value, label: ROLE_LABELS[value] }));
const ACTIVE_PARAMS = { activo: true, pageSize: 100 };

export default function UsersPage() {
  usePageTitle('Usuarios');
  const { user: me } = useAuth();
  const list = usePagedList(usersApi.list);
  const dependencies = useLoadedList(dependenciesApi.list, ACTIVE_PARAMS);

  const [editing, setEditing] = useState(null); // null cerrado, {} nuevo, objeto = edición
  const [resetting, setResetting] = useState(null);
  const [supervising, setSupervising] = useState(null);
  const [toggling, setToggling] = useState(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const { updateFilters } = list;
  const onSearch = useCallback((q) => updateFilters({ q: q || undefined }), [updateFilters]);

  const confirmToggle = async () => {
    setToggleBusy(true);
    try {
      await usersApi.setStatus(toggling.id_usuario, !toggling.activo);
      toast.success(toggling.activo ? 'Usuario desactivado. Sus sesiones se cerraron' : 'Usuario activado');
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
      header: 'Usuario',
      render: (row) => (
        <div>
          <strong>
            {row.apellidos}, {row.nombres}
          </strong>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>{row.correo}</p>
        </div>
      ),
    },
    { key: 'rol', header: 'Perfil', width: '130px', render: (row) => <Badge color="var(--color-primary)">{ROLE_LABELS[row.rol] ?? row.rol}</Badge> },
    { key: 'dependencia', header: 'Dependencia', render: (row) => row.dependencia || <span style={{ color: 'var(--color-text-muted)' }}>—</span> },
    {
      key: 'activo',
      header: 'Estado',
      width: '170px',
      render: (row) => (
        <div style={{ display: 'grid', gap: 'var(--space-1)', justifyItems: 'start' }}>
          <ActiveBadge active={row.activo} />
          {row.debe_cambiar_password ? <Badge color="var(--color-warning)">Cambio de contraseña pendiente</Badge> : null}
        </div>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      width: '260px',
      render: (row) => {
        const isMe = row.id_usuario === me.id_usuario;
        const name = `${row.nombres} ${row.apellidos}`;
        return (
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button size="sm" variant="secondary" onClick={() => setEditing(row)} aria-label={`Editar ${name}`}>
              Editar
            </Button>
            {row.rol === ROLES.SUPERVISOR ? (
              <Button size="sm" variant="secondary" onClick={() => setSupervising(row)} aria-label={`Supervisión de ${name}`}>
                Supervisión
              </Button>
            ) : null}
            {!isMe ? (
              <Button size="sm" variant="ghost" onClick={() => setResetting(row)} aria-label={`Restablecer contraseña de ${name}`}>
                Contraseña
              </Button>
            ) : null}
            {!isMe ? (
              <Button size="sm" variant="ghost" onClick={() => setToggling(row)} aria-label={`${row.activo ? 'Desactivar' : 'Activar'} ${name}`}>
                {row.activo ? 'Desactivar' : 'Activar'}
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Crea cuentas, asigna perfiles y dependencias, restablece contraseñas y define qué dependencias supervisa cada supervisor."
        actions={
          <Button icon={Plus} onClick={() => setEditing({})}>
            Nuevo usuario
          </Button>
        }
      />

      <ListCard
        list={list}
        columns={columns}
        rowKey={(row) => row.id_usuario}
        emptyTitle="No hay usuarios para mostrar"
        emptyDescription="Ajusta los filtros o crea un usuario nuevo."
        toolbar={
          <ListToolbar searchLabel="Buscar usuario" searchPlaceholder="Buscar por nombre o correo…" onSearch={onSearch}>
            <Select label="Perfil" placeholder="Todos" options={ROLE_FILTER_OPTIONS} value={list.filters.rol ?? ''} onChange={(e) => updateFilters({ rol: e.target.value || undefined })} />
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

      <UserFormModal
        open={editing !== null}
        record={editing}
        dependencies={dependencies.items}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          list.reload();
        }}
      />
      <ResetPasswordModal
        user={resetting}
        onClose={() => {
          setResetting(null);
          list.reload();
        }}
      />
      <SupervisionModal user={supervising} dependencies={dependencies.items} onClose={() => setSupervising(null)} />

      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.activo ? '¿Desactivar usuario?' : '¿Activar usuario?'}
        message={
          toggling?.activo
            ? `${toggling?.nombres} ${toggling?.apellidos} no podrá ingresar y se cerrarán sus sesiones. Si es funcionario con asignaciones activas o el último administrador, el sistema no lo permitirá.`
            : `${toggling?.nombres} ${toggling?.apellidos} podrá volver a ingresar al sistema.`
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
