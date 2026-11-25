import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getStateMeta } from '../../utils/statusColors.js';
import { monthLabel } from '../../utils/reports.js';
import styles from './Reports.module.css';

/**
 * Gráficos de los reportes. Cada uno va dentro de un contenedor con role="img" y etiqueta que resume los datos;
 * los mismos números están siempre disponibles en la tabla contigua (no dependen del color ni del gráfico).
 */

const PALETTE = ['#245a91', '#e6a23c', '#198754', '#718096', '#dc3545', '#6f42c1', '#17a2b8', '#b7791f'];

function Frame({ label, height = 280, children }) {
  return (
    <div className={styles.chart} style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>{children}</ResponsiveContainer>
    </div>
  );
}

/** Dona de solicitudes por estado (solo estados con datos). */
export function StatusChart({ rows }) {
  const data = rows.filter((row) => row.total > 0).map((row) => ({ name: getStateMeta(row.estado).label, value: row.total, color: getStateMeta(row.estado).color }));
  if (data.length === 0) return null;
  const label = `Solicitudes por estado: ${data.map((d) => `${d.name} ${d.value}`).join(', ')}`;
  return (
    <Frame label={label}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
          {data.map((d) => <Cell key={d.name} fill={d.color} />)}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </Frame>
  );
}

/** Barras por mes: registradas y resueltas. */
export function PeriodChart({ rows }) {
  const data = rows.map((row) => ({ mes: monthLabel(row.periodo), Registradas: row.total, Resueltas: row.resueltas, Rechazadas: row.rechazadas }));
  if (data.every((d) => d.Registradas === 0)) return null;
  const label = `Solicitudes por mes: ${data.map((d) => `${d.mes} ${d.Registradas} registradas, ${d.Resueltas} resueltas`).join('; ')}`;
  return (
    <Frame label={label}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="mes" />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Bar dataKey="Registradas" fill={PALETTE[0]} />
        <Bar dataKey="Resueltas" fill={PALETTE[2]} />
        <Bar dataKey="Rechazadas" fill={PALETTE[4]} />
      </BarChart>
    </Frame>
  );
}

/** Barras horizontales por categoría o dependencia: abiertas, con retraso y cerradas/resueltas. */
export function GroupChart({ rows, nameKey, title }) {
  const data = rows.map((row) => ({ nombre: row[nameKey], Total: row.total, 'Con retraso': row.con_retraso }));
  if (data.length === 0) return null;
  const label = `${title}: ${data.map((d) => `${d.nombre} ${d.Total} (${d['Con retraso']} con retraso)`).join('; ')}`;
  return (
    <Frame label={label} height={Math.max(200, data.length * 48 + 60)}>
      <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="nombre" width={140} />
        <Tooltip />
        <Legend />
        <Bar dataKey="Total" fill={PALETTE[0]} />
        <Bar dataKey="Con retraso" fill={PALETTE[4]} />
      </BarChart>
    </Frame>
  );
}
