'use strict';

const reportRepository = require('../repositories/report.repository');
const { PERMISSIONS, can, requestScopeFor, reportScopeFor } = require('../utils/permissions');
const { forbidden } = require('../utils/errors');
const { currentMonth, lastMonths, resolvePeriod, toRange, monthsBetween, formatDmy } = require('../utils/period');
const { toCsv } = require('../utils/csv');

const STATES = ['REGISTRADA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA', 'RECHAZADA', 'REABIERTA'];
const SCOPE_LABEL = {
  ALL: 'todas las solicitudes del sistema',
  OWN: 'tus solicitudes',
  ASSIGNED: 'solicitudes asignadas a ti',
  SUPERVISED: 'solicitudes de las dependencias que supervisas',
};

const round1 = (value) => (value === null || value === undefined ? null : Math.round(Number(value) * 10) / 10);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** Convierte una fila agregada al formato público (promedios en horas con 1 decimal; % de cumplimiento del SLA). */
function shapeMetrics(row) {
  const { con_resolucion: conResolucion, dentro_sla: dentroSla, ...rest } = row;
  return {
    ...rest,
    tiempo_atencion_horas: round1(row.tiempo_atencion_horas),
    tiempo_resolucion_horas: round1(row.tiempo_resolucion_horas),
    cumplimiento_sla: pct(dentroSla, conResolucion),
  };
}

function context(user, query, { permissioned, defaultPeriod }) {
  if (permissioned && !can(user.rol, PERMISSIONS.REPORTS_VIEW)) throw forbidden();
  const scope = permissioned ? reportScopeFor(user.rol) : requestScopeFor(user.rol);
  if (!scope) throw forbidden();
  const periodo = resolvePeriod(query, defaultPeriod ?? currentMonth());
  const filters = { scope, user, range: toRange(periodo), idDependencia: query.idDependencia, idCategoria: query.idCategoria };
  const ambito = SCOPE_LABEL[scope];
  return {
    filters,
    envelope: {
      periodo,
      ambito,
      criterio: `Solicitudes registradas entre ${formatDmy(periodo.desde)} y ${formatDmy(periodo.hasta)}; ${ambito}`,
    },
  };
}

/** Indicadores del dashboard para cualquier perfil (el estudiante, sobre sus propias solicitudes). */
async function dashboard(query, user) {
  const { filters, envelope } = context(user, query, { permissioned: false });
  const row = await reportRepository.summary(filters);
  return { ...envelope, indicadores: shapeMetrics(row) };
}

async function byStatus(query, user) {
  const { filters, envelope } = context(user, query, { permissioned: true });
  const rows = await reportRepository.byStatus(filters);
  const counts = Object.fromEntries(rows.map((r) => [r.estado, r.total]));
  return { ...envelope, filas: STATES.map((estado) => ({ estado, total: counts[estado] ?? 0 })) };
}

async function byCategory(query, user) {
  const { filters, envelope } = context(user, query, { permissioned: true });
  return { ...envelope, filas: (await reportRepository.byCategory(filters)).map(shapeMetrics) };
}

async function byDependency(query, user) {
  const { filters, envelope } = context(user, query, { permissioned: true });
  return { ...envelope, filas: (await reportRepository.byDependency(filters)).map(shapeMetrics) };
}

/** Sin fechas el periodo por defecto son los últimos 6 meses (una sola barra no mostraría tendencia). */
async function byPeriod(query, user) {
  const { filters, envelope } = context(user, query, { permissioned: true, defaultPeriod: lastMonths(6) });
  const rows = await reportRepository.byPeriod(filters);
  const found = Object.fromEntries(rows.map((r) => [r.periodo, r]));
  const filas = monthsBetween(envelope.periodo).map((periodo) => found[periodo] ?? { periodo, total: 0, resueltas: 0, rechazadas: 0 });
  return { ...envelope, filas };
}

const METRIC_COLUMNS = [
  { key: 'total', header: 'Total' }, { key: 'pendientes', header: 'Pendientes' }, { key: 'en_proceso', header: 'En proceso' },
  { key: 'resueltas', header: 'Resueltas' }, { key: 'cerradas', header: 'Cerradas' }, { key: 'rechazadas', header: 'Rechazadas' },
  { key: 'abiertas', header: 'Abiertas' }, { key: 'con_retraso', header: 'Con retraso' },
  { key: 'tiempo_atencion_horas', header: 'Tiempo de atención (h)' }, { key: 'tiempo_resolucion_horas', header: 'Tiempo de resolución (h)' },
  { key: 'cumplimiento_sla', header: 'Cumplimiento SLA (%)' },
];

const CSV_DEFS = {
  'by-status': { columns: [{ key: 'estado', header: 'Estado' }, { key: 'total', header: 'Total' }], file: 'solicitudes-por-estado' },
  'by-category': { columns: [{ key: 'categoria', header: 'Categoría' }, ...METRIC_COLUMNS], file: 'solicitudes-por-categoria' },
  'by-dependency': { columns: [{ key: 'dependencia', header: 'Dependencia' }, ...METRIC_COLUMNS], file: 'solicitudes-por-dependencia' },
  'by-period': {
    columns: [{ key: 'periodo', header: 'Mes' }, { key: 'total', header: 'Registradas' }, { key: 'resueltas', header: 'Resueltas' }, { key: 'rechazadas', header: 'Rechazadas' }],
    file: 'solicitudes-por-mes',
  },
};

/** CSV de un reporte, con el periodo y el criterio como primeras líneas (transparencia, §5.4). */
function csvFor(report, result) {
  const def = CSV_DEFS[report];
  const body = toCsv(def.columns, result.filas);
  const strip = (text) => text.replace(/^\uFEFF/, '');
  const preface = `${strip(toCsv([{ key: 'c', header: result.criterio }], [])).trimEnd()}\r\n`;
  return { filename: `${def.file}_${result.periodo.desde}_${result.periodo.hasta}.csv`, content: preface + strip(body) };
}

module.exports = { dashboard, byStatus, byCategory, byDependency, byPeriod, csvFor };
