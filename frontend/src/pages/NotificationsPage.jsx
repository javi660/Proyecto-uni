import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, Card, EmptyState, PageHeader, Select, Spinner } from '../components/common/index.js';
import Pagination from '../components/admin/Pagination.jsx';
import { useNotifications } from '../context/NotificationsContext.jsx';
import { usePagedList } from '../hooks/usePagedList.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { notificationsApi } from '../services/notifications.service.js';
import { errorMessage } from '../utils/formErrors.js';
import { formatDateTime } from '../utils/format.js';
import styles from './NotificationsPage.module.css';

const FILTER_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'false', label: 'No leídas' },
  { value: 'true', label: 'Leídas' },
];

/** Bandeja de notificaciones del usuario: leer, marcar como leída y abrir la solicitud relacionada. */
export default function NotificationsPage() {
  usePageTitle('Notificaciones');
  const navigate = useNavigate();
  const { refresh, unread } = useNotifications();
  const list = usePagedList(notificationsApi.list, {}, { pageSize: 20 });
  const [markingAll, setMarkingAll] = useState(false);
  const [local, setLocal] = useState({}); // id → leída, para reflejar al instante sin recargar

  const isRead = (item) => local[item.id_notificacion] ?? item.leida;

  const open = async (item) => {
    if (!isRead(item)) {
      try {
        await notificationsApi.markRead(item.id_notificacion);
        setLocal((current) => ({ ...current, [item.id_notificacion]: true }));
        refresh();
      } catch (error) {
        toast.error(errorMessage(error));
        return;
      }
    }
    if (item.id_solicitud) navigate(`/solicitudes/${item.id_solicitud}`);
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await notificationsApi.markAllRead();
      toast.success('Todas las notificaciones quedaron como leídas');
      setLocal({});
      list.reload();
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Notificaciones"
        description="Avisos sobre el avance de tus solicitudes."
        actions={
          <Button variant="secondary" icon={CheckCheck} onClick={markAll} loading={markingAll} disabled={unread === 0}>
            Marcar todas como leídas
          </Button>
        }
      />
      <Card>
        <div style={{ maxWidth: 220, marginBottom: 'var(--space-4)' }}>
          <Select
            label="Mostrar"
            value={list.filters.leida ?? ''}
            options={FILTER_OPTIONS}
            onChange={(event) => list.updateFilters({ leida: event.target.value || undefined })}
          />
        </div>

        {list.error ? (
          <Alert type="error" title="No se pudieron cargar las notificaciones">
            {list.error.message}{' '}
            <Button size="sm" variant="secondary" onClick={list.reload}>Reintentar</Button>
          </Alert>
        ) : list.loading && list.items.length === 0 ? (
          <Spinner label="Cargando notificaciones…" />
        ) : list.items.length === 0 ? (
          <EmptyState icon={Bell} title="No hay notificaciones" description="Cuando tus solicitudes avancen, te avisaremos aquí." />
        ) : (
          <ul className={styles.list} aria-label="Notificaciones">
            {list.items.map((item) => {
              const read = isRead(item);
              return (
                <li key={item.id_notificacion}>
                  <button type="button" className={`${styles.item} ${read ? '' : styles.unread}`} onClick={() => open(item)}>
                    <span className={styles.dot} aria-hidden="true" />
                    <span className={styles.body}>
                      <strong>{item.titulo}</strong>
                      <span>{item.mensaje}</span>
                      <span className={styles.meta}>
                        {item.codigo ? `${item.codigo} · ` : ''}{formatDateTime(item.creada_en)}
                      </span>
                    </span>
                    {read ? null : <span className={styles.badge}>Nueva</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination meta={list.meta} onPageChange={list.setPage} />
      </Card>
    </>
  );
}
