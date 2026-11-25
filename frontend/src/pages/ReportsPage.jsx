import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, Card, EmptyState, PageHeader, Spinner } from '../components/common/index.js';
import ReportFilters from '../components/reports/ReportFilters.jsx';
import MetricsTable from '../components/reports/MetricsTable.jsx';
import { GroupChart, PeriodChart, StatusChart } from '../components/reports/Charts.jsx';
import styles from '../components/reports/Reports.module.css';
import { useAuth } from '../hooks/useAuth.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { categoriesApi, dependenciesApi } from '../services/catalog.service.js';
import { reportsApi } from '../services/reports.service.js';
import { errorMessage } from '../utils/formErrors.js';
import { getStateMeta } from '../utils/statusColors.js';
import { monthLabel, saveBlob } from '../utils/reports.js';

const REPORTS = [
  { key: 'by-status', fn: 'byStatus' },
  { key: 'by-period', fn: 'byPeriod' },
  { key: 'by-category', fn: 'byCategory' },
  { key: 'by-dependency', fn: 'byDependency' },
];

function Section({ title, report, filters, children, hasData }) {
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await reportsApi.exportCsv(report, filters);
      saveBlob(blob, filename);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  };
  return (
    <Card>
      <div className={styles.sectionHead}>
        <h2>{title}</h2>
        {hasData ? (
          <Button size="sm" variant="secondary" icon={Download} onClick={exportCsv} loading={exporting} aria-label={`Exportar CSV: ${title}`}>
            Exportar CSV
          </Button>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

/** Reportes del administrador, el supervisor (su ámbito) y el funcionario (sus cifras). */
export default function ReportsPage() {
  usePageTitle('Reportes');
  const { user } = useAuth();
  const [filters, setFilters] = useState({});
  const [applied, setApplied] = useState({});
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [catalogs, setCatalogs] = useState({ dependencies: [], categories: [] });

  useEffect(() => {
    let alive = true;
    Promise.all([dependenciesApi.list({ pageSize: 100 }), categoriesApi.list({ pageSize: 100 })])
      .then(([deps, cats]) => alive && setCatalogs({ dependencies: deps.items, categories: cats.items }))
      .catch(() => {}); // sin catálogos los filtros por dependencia/categoría quedan solo en "Todas"
    return () => { alive = false; };
  }, []);

  const load = useCallback(async (params) => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(REPORTS.map((r) => reportsApi[r.fn](params)));
      setData(Object.fromEntries(REPORTS.map((r, i) => [r.key, results[i]])));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(applied); }, [load, applied]);

  // Los filtros se aplican con un pequeño retraso para no consultar en cada tecla.
  useEffect(() => {
    const timer = setTimeout(() => setApplied(filters), 300);
    return () => clearTimeout(timer);
  }, [filters]);

  const status = data?.['by-status'];
  const period = data?.['by-period'];
  const categories = data?.['by-category'];
  const dependencies = data?.['by-dependency'];
  const anything = status && status.filas.some((row) => row.total > 0);

  return (
    <>
      <PageHeader
        title="Reportes"
        description={user.rol === 'FUNCIONARIO' ? 'Cifras de las solicitudes que se te asignaron.' : 'Solicitudes por estado, mes, categoría y dependencia, con tiempos de atención.'}
      />
      <Card>
        <ReportFilters value={filters} onChange={setFilters} dependencies={catalogs.dependencies} categories={catalogs.categories} onReset={() => setFilters({})} />
        {status ? <p className={styles.criterio} style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>{status.criterio}</p> : null}
      </Card>

      {error ? (
        <Alert type="error" title="No se pudieron cargar los reportes">
          {error} <Button size="sm" variant="secondary" onClick={() => load(applied)}>Reintentar</Button>
        </Alert>
      ) : loading && !data ? (
        <Spinner label="Cargando reportes…" />
      ) : data ? (
        <>
          {!anything ? (
            <Card><EmptyState title="Sin solicitudes en este periodo" description="Prueba con otro rango de fechas o quita algún filtro." /></Card>
          ) : null}

          <Section title="Solicitudes por estado" report="by-status" filters={applied} hasData={anything}>
            <StatusChart rows={status.filas} />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>Solicitudes por estado</caption>
                <thead><tr><th scope="col">Estado</th><th scope="col">Solicitudes</th></tr></thead>
                <tbody>
                  {status.filas.map((row) => (
                    <tr key={row.estado}><th scope="row">{getStateMeta(row.estado).label}</th><td>{row.total}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Solicitudes por mes" report="by-period" filters={applied} hasData={anything}>
            <PeriodChart rows={period.filas} />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>Solicitudes por mes</caption>
                <thead><tr><th scope="col">Mes</th><th scope="col">Registradas</th><th scope="col">Resueltas</th><th scope="col">Rechazadas</th></tr></thead>
                <tbody>
                  {period.filas.map((row) => (
                    <tr key={row.periodo}><th scope="row">{monthLabel(row.periodo)}</th><td>{row.total}</td><td>{row.resueltas}</td><td>{row.rechazadas}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {period.periodo.por_defecto ? <p className={styles.criterio}>Sin fechas se muestran los últimos 6 meses.</p> : null}
          </Section>

          <Section title="Por categoría" report="by-category" filters={applied} hasData={categories.filas.length > 0}>
            <GroupChart rows={categories.filas} nameKey="categoria" title="Solicitudes por categoría" />
            {categories.filas.length > 0 ? <MetricsTable rows={categories.filas} nameKey="categoria" nameLabel="Categoría" caption="Indicadores por categoría" /> : <p>Sin datos.</p>}
          </Section>

          <Section title="Por dependencia" report="by-dependency" filters={applied} hasData={dependencies.filas.length > 0}>
            <GroupChart rows={dependencies.filas} nameKey="dependencia" title="Solicitudes por dependencia" />
            {dependencies.filas.length > 0 ? <MetricsTable rows={dependencies.filas} nameKey="dependencia" nameLabel="Dependencia" caption="Indicadores por dependencia" /> : <p>Sin datos.</p>}
          </Section>
        </>
      ) : null}
    </>
  );
}
