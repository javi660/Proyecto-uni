'use strict';

const db = require('../config/database');
const { createWhere } = require('../utils/sql');
const { addScope } = require('./request.repository');

/**
 * Consultas agregadas de indicadores (DECISIONES §5). Siempre parten del mismo conjunto de registros:
 * solicitudes dentro del alcance del usuario, registradas en el periodo y con los filtros pedidos.
 */

const FROM = `
  FROM solicitudes s
  JOIN servicios sv ON sv.id_servicio = s.id_servicio
  JOIN categorias c ON c.id_categoria = sv.id_categoria
  JOIN dependencias d ON d.id_dependencia = sv.id_dependencia
  LEFT JOIN LATERAL (
    SELECT MIN(h.fecha_cambio) AS inicio
      FROM historial_estados h
     WHERE h.id_solicitud = s.id_solicitud AND h.estado_nuevo = 'EN_PROCESO'
  ) att ON TRUE`;

const OPEN = `s.estado NOT IN ('RESUELTA', 'CERRADA', 'RECHAZADA')`;
const HOURS = (expr) => `EXTRACT(EPOCH FROM (${expr})) / 3600`;

/** Métricas comunes a resumen, categoría y dependencia. */
const METRICS = `
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE s.estado IN ('REGISTRADA', 'ASIGNADA', 'REABIERTA'))::int AS pendientes,
  COUNT(*) FILTER (WHERE s.estado = 'EN_PROCESO')::int AS en_proceso,
  COUNT(*) FILTER (WHERE s.estado = 'RESUELTA')::int AS resueltas,
  COUNT(*) FILTER (WHERE s.estado = 'CERRADA')::int AS cerradas,
  COUNT(*) FILTER (WHERE s.estado = 'RECHAZADA')::int AS rechazadas,
  COUNT(*) FILTER (WHERE ${OPEN})::int AS abiertas,
  COUNT(*) FILTER (WHERE ${OPEN} AND NOW() - s.fecha_registro > sv.sla_horas * INTERVAL '1 hour')::int AS con_retraso,
  AVG(${HOURS('att.inicio - s.fecha_registro')}) AS tiempo_atencion_horas,
  AVG(${HOURS('s.fecha_resolucion - s.fecha_registro')}) FILTER (WHERE s.fecha_resolucion IS NOT NULL) AS tiempo_resolucion_horas,
  COUNT(*) FILTER (WHERE s.fecha_resolucion IS NOT NULL)::int AS con_resolucion,
  COUNT(*) FILTER (WHERE s.fecha_resolucion IS NOT NULL
                     AND s.fecha_resolucion - s.fecha_registro <= sv.sla_horas * INTERVAL '1 hour')::int AS dentro_sla`;

function baseWhere({ scope, user, range, idDependencia, idCategoria }) {
  const where = createWhere();
  addScope(where, scope, user);
  where.add('s.fecha_registro >= $?', range.desde);
  where.add('s.fecha_registro < $?', range.hasta);
  if (idDependencia !== undefined) where.add('sv.id_dependencia = $?', idDependencia);
  if (idCategoria !== undefined) where.add('sv.id_categoria = $?', idCategoria);
  return where.build();
}

async function summary(filters) {
  const { clause, params } = baseWhere(filters);
  const { rows } = await db.query(`SELECT ${METRICS} ${FROM} ${clause}`, params);
  return rows[0];
}

async function byStatus(filters) {
  const { clause, params } = baseWhere(filters);
  const { rows } = await db.query(`SELECT s.estado, COUNT(*)::int AS total ${FROM} ${clause} GROUP BY s.estado`, params);
  return rows;
}

async function byCategory(filters) {
  const { clause, params } = baseWhere(filters);
  const { rows } = await db.query(
    `SELECT c.id_categoria, c.nombre AS categoria, ${METRICS} ${FROM} ${clause} GROUP BY c.id_categoria, c.nombre ORDER BY total DESC, c.nombre`,
    params,
  );
  return rows;
}

async function byDependency(filters) {
  const { clause, params } = baseWhere(filters);
  const { rows } = await db.query(
    `SELECT d.id_dependencia, d.nombre AS dependencia, ${METRICS} ${FROM} ${clause} GROUP BY d.id_dependencia, d.nombre ORDER BY total DESC, d.nombre`,
    params,
  );
  return rows;
}

async function byPeriod(filters) {
  const { clause, params } = baseWhere(filters);
  const { rows } = await db.query(
    `SELECT to_char(date_trunc('month', s.fecha_registro AT TIME ZONE 'America/Bogota'), 'YYYY-MM') AS periodo,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE s.fecha_resolucion IS NOT NULL)::int AS resueltas,
            COUNT(*) FILTER (WHERE s.estado = 'RECHAZADA')::int AS rechazadas
       ${FROM} ${clause} GROUP BY 1 ORDER BY 1`,
    params,
  );
  return rows;
}

module.exports = { summary, byStatus, byCategory, byDependency, byPeriod };
