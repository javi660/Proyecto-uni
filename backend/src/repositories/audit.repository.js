'use strict';

const db = require('../config/database');
const { createWhere, toLimitOffset } = require('../utils/sql');

/**
 * Inserta un registro de auditoría. La tabla es de solo inserción (triggers en la base).
 * NUNCA debe recibir contraseñas, tokens ni secretos en `detalle`.
 */
async function insert(
  { idUsuario = null, operacion, recurso, idRecurso = null, resultado, detalle = null, ip = null },
  client = null,
) {
  await (client || db).query(
    `INSERT INTO auditoria (id_usuario, operacion, recurso, id_recurso, resultado, detalle, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      idUsuario,
      operacion,
      recurso,
      idRecurso === null ? null : String(idRecurso),
      resultado,
      detalle === null ? null : JSON.stringify(detalle),
      ip,
    ],
  );
}

const COLUMNS = `a.id_auditoria, a.id_usuario, NULLIF(BTRIM(u.nombres || ' ' || u.apellidos), '') AS usuario, u.correo,
  a.operacion, a.recurso, a.id_recurso, a.resultado, a.detalle, host(a.ip) AS ip, a.creado_en`;
const FROM = 'FROM auditoria a LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario';

/** Consulta paginada (más recientes primero) con filtros exactos; `range` ya viene en instantes UTC. */
async function list({ page, pageSize, operacion, recurso, idRecurso, idUsuario, resultado, range }) {
  const where = createWhere();
  if (operacion) where.add('a.operacion = $?', operacion);
  if (recurso) where.add('a.recurso = $?', recurso);
  if (idRecurso) where.add('a.id_recurso = $?', idRecurso);
  if (idUsuario !== undefined) where.add('a.id_usuario = $?', idUsuario);
  if (resultado) where.add('a.resultado = $?', resultado);
  if (range?.desde) where.add('a.creado_en >= $?', range.desde);
  if (range?.hasta) where.add('a.creado_en < $?', range.hasta);
  const { clause, params } = where.build();
  const { limit, offset } = toLimitOffset({ page, pageSize });
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT ${COLUMNS} ${FROM} ${clause} ORDER BY a.creado_en DESC, a.id_auditoria DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    db.query(`SELECT COUNT(*)::int AS total FROM auditoria a ${clause}`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function findById(id) {
  const { rows } = await db.query(`SELECT ${COLUMNS} ${FROM} WHERE a.id_auditoria = $1`, [id]);
  return rows[0] ?? null;
}

/** Valores existentes para poblar los filtros de la pantalla. */
async function distinctValues() {
  const [operaciones, recursos] = await Promise.all([
    db.query('SELECT DISTINCT operacion FROM auditoria ORDER BY operacion'),
    db.query('SELECT DISTINCT recurso FROM auditoria ORDER BY recurso'),
  ]);
  return { operaciones: operaciones.rows.map((r) => r.operacion), recursos: recursos.rows.map((r) => r.recurso) };
}

module.exports = { insert, list, findById, distinctValues };
