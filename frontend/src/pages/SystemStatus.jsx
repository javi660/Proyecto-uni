import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, RefreshCw, Server, Database, MonitorSmartphone, GraduationCap } from 'lucide-react';
import { getApiHealth, getDatabaseHealth } from '../services/health.service.js';
import { formatDateTime } from '../utils/formatDate.js';
import styles from './SystemStatus.module.css';

const IDLE = { state: 'loading', message: 'Comprobando…', detail: '' };

/** Ejecuta una comprobación y la convierte en { state, message, detail }. */
async function runCheck(fetcher, buildDetail) {
  try {
    const data = await fetcher();
    return { state: 'ok', message: 'Operativo', detail: buildDetail(data) };
  } catch (error) {
    return { state: 'error', message: error.message || 'Sin respuesta', detail: error.code || '' };
  }
}

function StatusCard({ icon: Icon, title, check }) {
  return (
    <article className={`${styles.card} ${styles[check.state]}`} aria-live="polite">
      <div className={styles.cardIcon}>
        <Icon size={22} aria-hidden="true" />
      </div>
      <div className={styles.cardBody}>
        <h2 className={styles.cardTitle}>{title}</h2>
        <p className={styles.cardMessage}>
          {check.state === 'loading' && <Loader2 size={16} className={styles.spin} aria-hidden="true" />}
          {check.state === 'ok' && <CheckCircle2 size={16} aria-hidden="true" />}
          {check.state === 'error' && <XCircle size={16} aria-hidden="true" />}
          <span>{check.message}</span>
        </p>
        {check.detail && <p className={styles.cardDetail}>{check.detail}</p>}
      </div>
    </article>
  );
}

/**
 * Pantalla de verificación de la Fase 1: confirma que el frontend, la API y la base de datos
 * están conectados. Se reemplaza por el inicio de sesión en la Fase 4.
 */
export default function SystemStatus() {
  const [api, setApi] = useState(IDLE);
  const [database, setDatabase] = useState(IDLE);
  const [checking, setChecking] = useState(false);

  const verify = useCallback(async () => {
    setChecking(true);
    setApi(IDLE);
    setDatabase(IDLE);

    const [apiResult, dbResult] = await Promise.all([
      runCheck(getApiHealth, (data) => `Servidor activo · ${formatDateTime(data.timestamp)}`),
      runCheck(getDatabaseHealth, (data) => `Respuesta de la base de datos en ${data.latencyMs} ms`),
    ]);

    setApi(apiResult);
    setDatabase(dbResult);
    setChecking(false);
  }, []);

  useEffect(() => {
    verify();
  }, [verify]);

  const allOk = api.state === 'ok' && database.state === 'ok';

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <GraduationCap size={30} aria-hidden="true" />
          <span className={styles.brandName}>SGSSU</span>
        </div>
        <h1 className={styles.title}>Sistema de Gestión de Servicios y Solicitudes Universitarias</h1>
        <p className={styles.subtitle}>Verificación del entorno · Fase 1</p>
      </header>

      <section className={styles.grid} aria-label="Estado de los componentes">
        <StatusCard
          icon={MonitorSmartphone}
          title="Interfaz web (React)"
          check={{ state: 'ok', message: 'Operativa', detail: 'Aplicación cargada en el navegador' }}
        />
        <StatusCard icon={Server} title="API (Node.js + Express)" check={api} />
        <StatusCard icon={Database} title="Base de datos (Supabase)" check={database} />
      </section>

      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={verify} disabled={checking}>
          <RefreshCw size={16} className={checking ? styles.spin : undefined} aria-hidden="true" />
          {checking ? 'Comprobando…' : 'Volver a comprobar'}
        </button>
      </div>

      {!checking && allOk && (
        <p className={styles.summaryOk}>Todo está conectado. El proyecto está listo para la Fase 2 (base de datos).</p>
      )}
      {!checking && !allOk && (
        <p className={styles.summaryError}>
          Hay componentes sin conexión. Si la base de datos falla, ejecuta <code>npm run check:db</code> en la
          carpeta <code>backend</code> para ver el diagnóstico.
        </p>
      )}

      <footer className={styles.footer}>
        Esta pantalla es temporal: será reemplazada por el inicio de sesión en la Fase 4.
      </footer>
    </main>
  );
}
