import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Alert, Card, PageHeader, Spinner } from '../components/common/index.js';
import StatCard from '../components/reports/StatCard.jsx';
import { StatusChart } from '../components/reports/Charts.jsx';
import reportStyles from '../components/reports/Reports.module.css';
import { reportsApi } from '../services/reports.service.js';
import { errorMessage } from '../utils/formErrors.js';
import { formatHours, formatPercent } from '../utils/reports.js';
import { useAuth } from '../hooks/useAuth.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { ROLE_LABELS, labelFor, routesForRole } from '../utils/navigation.js';
import styles from './DashboardPage.module.css';

const ROLE_INTRO = {
  ADMINISTRADOR: 'Administra usuarios, catálogo y dependencias, asigna solicitudes y consulta la auditoría.',
  ESTUDIANTE: 'Registra solicitudes y sigue su avance hasta recibir una respuesta.',
  FUNCIONARIO: 'Atiende las solicitudes que te asignaron y registra tus respuestas.',
  SUPERVISOR: 'Supervisa las solicitudes de tus dependencias, asígnalas y revisa los indicadores.',
};

/** Indicadores del periodo (mes en curso) según el perfil. El estudiante ve los de sus propias solicitudes. */
function Indicators({ role }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    reportsApi.dashboard({})
      .then((result) => alive && setData(result))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => { alive = false; };
  }, []);

  if (error) return <Alert type="error" title="No se pudieron cargar los indicadores">{error}</Alert>;
  if (!data) return <Spinner label="Cargando indicadores…" />;
  const i = data.indicadores;
  const staff = role !== 'ESTUDIANTE';
  const chartRows = [
    { estado: 'REGISTRADA', total: 0 }, { estado: 'EN_PROCESO', total: i.en_proceso }, { estado: 'RESUELTA', total: i.resueltas },
    { estado: 'CERRADA', total: i.cerradas }, { estado: 'RECHAZADA', total: i.rechazadas },
  ];
  return (
    <section aria-label="Indicadores">
      <p className={reportStyles.criterio}>{data.criterio}</p>
      <div className={reportStyles.statGrid}>
        <StatCard label="Registradas" value={i.total} />
        <StatCard label="Pendientes" value={i.pendientes} hint="Registradas, asignadas o reabiertas" />
        <StatCard label="En proceso" value={i.en_proceso} />
        <StatCard label="Resueltas" value={i.resueltas} />
        <StatCard label="Cerradas" value={i.cerradas} />
        <StatCard label="Rechazadas" value={i.rechazadas} />
        {staff ? <StatCard label="Con retraso" value={i.con_retraso} tone={i.con_retraso > 0 ? 'danger' : undefined} hint="Abiertas fuera del plazo (SLA)" /> : null}
        <StatCard label="Tiempo de atención" value={formatHours(i.tiempo_atencion_horas)} hint="Del registro al inicio de atención" />
        <StatCard label="Tiempo de resolución" value={formatHours(i.tiempo_resolucion_horas)} hint="Del registro a la resolución" />
        {staff ? <StatCard label="Cumplimiento del SLA" value={formatPercent(i.cumplimiento_sla)} hint="Resueltas dentro del plazo" /> : null}
      </div>
      {i.total > 0 ? <Card><StatusChart rows={chartRows.filter((row) => row.estado !== 'REGISTRADA').concat([{ estado: 'REGISTRADA', total: i.pendientes }])} /></Card> : null}
    </section>
  );
}

/** Pantalla de inicio: indicadores del mes y accesos rápidos. */
export default function DashboardPage() {
  usePageTitle('Inicio');
  const { user } = useAuth();
  const shortcuts = routesForRole(user.rol).filter((route) => route.section && !['/dashboard', '/perfil', '/notificaciones'].includes(route.path));

  return (
    <>
      <PageHeader title={`Hola, ${user.nombres}`} description={`${ROLE_LABELS[user.rol]} · ${ROLE_INTRO[user.rol]}`} />
      <Indicators role={user.rol} />
      <div className={styles.grid}>
        {shortcuts.map((route) => {
          const Icon = route.icon;
          return (
            <Link key={route.path} to={route.path} className={styles.shortcut}>
              <Card>
                <div className={styles.shortcutBody}>
                  <Icon size={24} aria-hidden="true" className={styles.icon} />
                  <span className={styles.label}>{labelFor(route, user.rol)}</span>
                  <ArrowRight size={16} aria-hidden="true" className={styles.arrow} />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
