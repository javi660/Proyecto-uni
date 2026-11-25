'use strict';

const db = require('../config/database');
const { escapeLike, createWhere, toLimitOffset } = require('../utils/sql');
const { REQUEST_SCOPES } = require('../utils/permissions');

/** Acceso a datos de solicitudes, historial inicial y adjuntos. */

const executor = (client) => client || db;

const SELECT = `
  SELECT s.id_solicitud, s.codigo, s.asunto, s.descripcion, s.estado, s.prioridad,
         s.id_servicio, sv.nombre AS servicio, sv.sla_horas,
         sv.id_categoria, c.nombre AS categoria,
         sv.id_dependencia, d.nombre AS dependencia,
         s.id_estudiante, (e.nombres || ' ' || e.apellidos) AS estudiante, e.correo AS estudiante_correo,
         asg.id_funcionario, (f.nombres || ' ' || f.apellidos) AS funcionario,
         s.fecha_registro, s.fecha_actualizacion, s.fecha_resolucion, s.fecha_cierre,
         (SELECT COUNT(*) FROM adjuntos a WHERE a.id_solicitud = s.id_solicitud) AS total_adjuntos
    FROM solicitudes s
    JOIN servicios sv ON sv.id_servicio = s.id_servicio
    JOIN categorias c ON c.id_categoria = sv.id_categoria
    JOIN dependencias d ON d.id_dependencia = sv.id_dependencia
    JOIN usuarios e ON e.id_usuario = s.id_estudiante
    LEFT JOIN asignaciones asg ON asg.id_solicitud = s.id_solicitud AND asg.activo
    LEFT JOIN usuarios f ON f.id_usuario = asg.id_funcionario`;

/**
 * Agrega al WHERE la condición de alcance del usuario (qué solicitudes puede ver).
 * ASSIGNED: la última asignación de la solicitud es suya (así conserva acceso tras el cierre,
 * pero lo pierde si la solicitud se reasigna a otro funcionario).
 */
function addScope(where, scope, user) {
  switch (scope) {
    case REQUEST_SCOPES.ALL:
      return;
    case REQUEST_SCOPES.OWN:
      where.add('s.id_estudiante = $?', user.id);
      return;
    case REQUEST_SCOPES.ASSIGNED:
      where.add(
        `EXISTS (SELECT 1 FROM asignaciones x WHERE x.id_solicitud = s.id_solicitud AND x.id_funcionario = $?
                   AND x.id_asignacion = (SELECT MAX(y.id_asignacion) FROM asignaciones y WHERE y.id_solicitud = s.id_solicitud))`,
        user.id,
      );
      return;
    case REQUEST_SCOPES.SUPERVISED:
      where.add(
        'EXISTS (SELECT 1 FROM supervision_dependencia sd WHERE sd.id_supervisor = $? AND sd.id_dependencia = sv.id_dependencia)',
        user.id,
      );
      return;
    default:
      where.addRaw('FALSE'); // alcance desconocido: no ve nada
  }
}

async function list({ scope, user, q, estado, prioridad, idServicio, idCategoria, idDependencia, desde, hasta, page, pageSize }, client = null) {
  const where = createWhere();
  addScope(where, scope, user);
  if (q) {
    where.add(
      `(s.codigo ILIKE $? ESCAPE '\\' OR s.asunto ILIKE $? ESCAPE '\\' OR (e.nombres || ' ' || e.apellidos) ILIKE $? ESCAPE '\\')`,
      `%${escapeLike(q)}%`,
    );
  }
  if (estado) where.add('s.estado = $?', estado);
  if (prioridad) where.add('s.prioridad = $?', prioridad);
  if (idServicio !== undefined) where.add('s.id_servicio = $?', idServicio);
  if (idCategoria !== undefined) where.add('sv.id_categoria = $?', idCategoria);
  if (idDependencia !== undefined) where.add('sv.id_dependencia = $?', idDependencia);
  if (desde) where.add('s.fecha_registro >= $?', desde);
  if (hasta) where.add('s.fecha_registro < $?', hasta);
  const { clause, params } = where.build();
  const { limit, offset } = toLimitOffset({ page, pageSize });

  const [{ rows }, { rows: count }] = await Promise.all([
    executor(client).query(
      `${SELECT} ${clause} ORDER BY s.fecha_registro DESC, s.id_solicitud DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    executor(client).query(
      `SELECT COUNT(*) AS total FROM solicitudes s JOIN servicios sv ON sv.id_servicio = s.id_servicio
         JOIN usuarios e ON e.id_usuario = s.id_estudiante ${clause}`,
      params,
    ),
  ]);
  return { rows, total: count[0].total };
}

/** Solicitud visible para el usuario según su alcance (null si no existe o está fuera de alcance). */
async function findVisibleById(id, scope, user, client = null) {
  const where = createWhere();
  where.add('s.id_solicitud = $?', id);
  addScope(where, scope, user);
  const { clause, params } = where.build();
  const { rows } = await executor(client).query(`${SELECT} ${clause}`, params);
  return rows[0] || null;
}

/**
 * Bloquea la fila de la solicitud (serializa subidas de adjuntos y asignaciones concurrentes).
 * La asignación activa se lee en una consulta POSTERIOR al bloqueo: en READ COMMITTED una subconsulta
 * del mismo SELECT ... FOR UPDATE usaría una instantánea anterior a la espera y podría estar obsoleta.
 */
async function lockById(id, client) {
  const { rows } = await client.query(
    'SELECT s.id_solicitud, s.estado, s.id_estudiante FROM solicitudes s WHERE s.id_solicitud = $1 FOR UPDATE OF s',
    [id],
  );
  if (!rows[0]) return null;
  const active = await client.query('SELECT id_funcionario FROM asignaciones WHERE id_solicitud = $1 AND activo', [id]);
  return { ...rows[0], id_funcionario_activo: active.rows[0] ? active.rows[0].id_funcionario : null };
}

async function insert({ idEstudiante, idServicio, asunto, descripcion }, client) {
  const { rows } = await client.query(
    `INSERT INTO solicitudes (id_estudiante, id_servicio, asunto, descripcion)
     VALUES ($1, $2, $3, $4) RETURNING id_solicitud`,
    [idEstudiante, idServicio, asunto, descripcion],
  );
  return rows[0].id_solicitud;
}

async function insertInitialHistory({ idSolicitud, idUsuario }, client) {
  await client.query(
    `INSERT INTO historial_estados (id_solicitud, estado_anterior, estado_nuevo, id_usuario, observacion)
     VALUES ($1, NULL, 'REGISTRADA', $2, 'Solicitud registrada')`,
    [idSolicitud, idUsuario],
  );
}

// ---------------------------------------------------------------- adjuntos

const ATTACHMENT_SELECT = `
  SELECT a.id_adjunto, a.id_solicitud, a.nombre_original, a.tipo_mime, a.tamano_bytes, a.creado_en,
         a.id_usuario, (u.nombres || ' ' || u.apellidos) AS subido_por
    FROM adjuntos a JOIN usuarios u ON u.id_usuario = a.id_usuario`;

async function listAttachments(idSolicitud, client = null) {
  const { rows } = await executor(client).query(`${ATTACHMENT_SELECT} WHERE a.id_solicitud = $1 ORDER BY a.creado_en ASC, a.id_adjunto ASC`, [idSolicitud]);
  return rows;
}

async function countAttachments(idSolicitud, client) {
  const { rows } = await client.query('SELECT COUNT(*) AS total FROM adjuntos WHERE id_solicitud = $1', [idSolicitud]);
  return rows[0].total;
}

async function insertAttachment({ idSolicitud, idUsuario, nombreOriginal, nombreAlmacenado, rutaArchivo, tipoMime, tamanoBytes }, client) {
  const { rows } = await client.query(
    `INSERT INTO adjuntos (id_solicitud, id_usuario, nombre_original, nombre_almacenado, ruta_archivo, tipo_mime, tamano_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_adjunto`,
    [idSolicitud, idUsuario, nombreOriginal, nombreAlmacenado, rutaArchivo, tipoMime, tamanoBytes],
  );
  return rows[0].id_adjunto;
}

async function findAttachmentById(id, client = null) {
  const { rows } = await executor(client).query(
    `SELECT id_adjunto, id_solicitud, nombre_original, ruta_archivo, tipo_mime, tamano_bytes FROM adjuntos WHERE id_adjunto = $1`,
    [id],
  );
  return rows[0] || null;
}

async function findAttachmentPublic(id, client = null) {
  const { rows } = await executor(client).query(`${ATTACHMENT_SELECT} WHERE a.id_adjunto = $1`, [id]);
  return rows[0] || null;
}

module.exports = {
  list, findVisibleById, lockById, insert, insertInitialHistory, addScope,
  listAttachments, countAttachments, insertAttachment, findAttachmentById, findAttachmentPublic,
};
