import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { Badge, Button, Input, PageHeader, Select } from '../../components/common/index.js';
import ListCard from '../../components/admin/ListCard.jsx';
import AuditDetailModal from '../../components/admin/AuditDetailModal.jsx';
import { usePagedList } from '../../hooks/usePagedList.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { auditApi } from '../../services/audit.service.js';
import { formatDateTime } from '../../utils/format.js';
import toolbar from '../../components/admin/ListToolbar.module.css';

const RESULT_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'EXITO', label: 'Éxito' },
  { value: 'FALLO', label: 'Fallo' },
];

/** Consulta de auditoría del sistema (solo administrador): filtros, tabla paginada y detalle por registro. */
export default function AuditPage() {
  usePageTitle('Auditoría');
  const list = usePagedList(auditApi.list, {}, { pageSize: 20 });
  const [options, setOptions] = useState({ operaciones: [], recursos: [] });
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let alive = true;
    auditApi.filters().then((data) => alive && setOptions(data)).catch(() => {}); // sin opciones, los filtros siguen funcionando con "Todas"
    return () => { alive = false; };
  }, []);

  const toOptions = (values, all) => [{ value: '', label: all }, ...values.map((v) => ({ value: v, label: v }))];
  const set = (key) => (event) => list.updateFilters({ [key]: event.target.value || undefined });

  const columns = [
    { key: 'creado_en', header: 'Fecha', render: (row) => formatDateTime(row.creado_en) },
    { key: 'usuario', header: 'Usuario', render: (row) => row.usuario ?? 'Sistema / sin sesión' },
    { key: 'operacion', header: 'Operación' },
    { key: 'recurso', header: 'Recurso', render: (row) => (row.id_recurso ? `${row.recurso} #${row.id_recurso}` : row.recurso) },
    {
      key: 'resultado',
      header: 'Resultado',
      render: (row) => <Badge color={row.resultado === 'EXITO' ? 'var(--color-success, #198754)' : 'var(--color-danger, #b02a37)'}>{row.resultado === 'EXITO' ? 'Éxito' : 'Fallo'}</Badge>,
    },
    { key: 'ip', header: 'IP', render: (row) => row.ip ?? '—' },
    {
      key: 'acciones',
      header: 'Detalle',
      align: 'right',
      render: (row) => (
        <Button size="sm" variant="secondary" icon={Eye} onClick={() => setSelected(row)} aria-label={`Ver detalle del registro ${row.id_auditoria}`}>
          Ver
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Auditoría" description="Registro de operaciones sensibles del sistema. Es de solo lectura." />
      <ListCard
        caption="Registros de auditoría"
        list={list}
        columns={columns}
        rowKey={(row) => row.id_auditoria}
        emptyTitle="Sin registros"
        emptyDescription="No hay registros que coincidan con los filtros."
        toolbar={
          <form className={toolbar.toolbar} onSubmit={(event) => event.preventDefault()} aria-label="Filtros de auditoría">
            <Select label="Operación" value={list.filters.operacion ?? ''} options={toOptions(options.operaciones, 'Todas')} onChange={set('operacion')} />
            <Select label="Recurso" value={list.filters.recurso ?? ''} options={toOptions(options.recursos, 'Todos')} onChange={set('recurso')} />
            <Select label="Resultado" value={list.filters.resultado ?? ''} options={RESULT_OPTIONS} onChange={set('resultado')} />
            <Input label="Desde" type="date" value={list.filters.desde ?? ''} max={list.filters.hasta} onChange={set('desde')} />
            <Input label="Hasta" type="date" value={list.filters.hasta ?? ''} min={list.filters.desde} onChange={set('hasta')} />
          </form>
        }
      />
      {selected ? <AuditDetailModal entry={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}
