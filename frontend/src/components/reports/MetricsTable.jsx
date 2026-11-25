import { formatHours, formatPercent } from '../../utils/reports.js';
import styles from './Reports.module.css';

/** Tabla de métricas por categoría o dependencia (equivalente textual del gráfico, con los tiempos). */
export default function MetricsTable({ rows, nameKey, nameLabel, caption }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{nameLabel}</th>
            <th scope="col">Total</th>
            <th scope="col">Abiertas</th>
            <th scope="col">Con retraso</th>
            <th scope="col">Atención (prom.)</th>
            <th scope="col">Resolución (prom.)</th>
            <th scope="col">Cumple SLA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[nameKey]}>
              <th scope="row">{row[nameKey]}</th>
              <td>{row.total}</td>
              <td>{row.abiertas}</td>
              <td className={row.con_retraso > 0 ? styles.late : undefined}>{row.con_retraso}</td>
              <td>{formatHours(row.tiempo_atencion_horas)}</td>
              <td>{formatHours(row.tiempo_resolucion_horas)}</td>
              <td>{formatPercent(row.cumplimiento_sla)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
