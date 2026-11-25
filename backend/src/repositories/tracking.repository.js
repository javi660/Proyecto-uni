'use strict';

const db = require('../config/database');

/** Acceso a datos de seguimiento: cambios de estado, prioridad, respuestas e historial. */

const executor = (client) => client || db;

/** Cambia el estado; las fechas derivadas se fijan en la misma sentencia (DECISIONES §4.5). */
async function updateState(idSolicitud, { estado, setResolution = false, setClosing = false }, client) {
  await client.query(
    `UPDATE solicitudes SET estado = $2,
            fecha_resolucion = CASE WHEN $3 THEN NOW() ELSE fecha_resolucion END,
            fecha_cierre = CASE WHEN $4 THEN NOW() ELSE fecha_cierre END
      WHERE id_solicitud = $1`,
    [idSolicitud, estado, setResolution, setClosing],
  );
}

async function updatePriority(idSolicitud, prioridad, client) {
  await client.query('UPDATE solicitudes SET prioridad = $2 WHERE id_solicitud = $1', [idSolicitud, prioridad]);
}

async function insertHistory({ idSolicitud, estadoAnterior, estadoNuevo, idUsuario, observacion, publica }, client) {
  await client.query(
    `INSERT INTO historial_estados (id_solicitud, estado_anterior, estado_nuevo, id_usuario, observacion, observacion_publica)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [idSolicitud, estadoAnterior, estadoNuevo, idUsuario, observacion, Boolean(observacion) && publica],
  );
}

/** Finaliza la asignación activa (al cerrar). */
async function finishActiveAssignment(idSolicitud, client) {
  await client.query('UPDATE asignaciones SET activo = FALSE, finalizado_en = clock_timestamp() WHERE id_solicitud = $1 AND activo', [idSolicitud]);
}

/**
 * ¿Hay una respuesta pública posterior al último paso a EN_PROCESO? Es la condición para resolver:
 * evita resolver con una respuesta de un ciclo anterior (p. ej. tras una reapertura).
 */
async function hasPublicResponseSinceStart(idSolicitud, client) {
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM respuestas r
        WHERE r.id_solicitud = $1 AND r.visibilidad = 'PUBLICA'
          AND r.creado_en >= COALESCE((SELECT MAX(h.fecha_cambio) FROM historial_estados h
                                        WHERE h.id_solicitud = $1 AND h.estado_nuevo = 'EN_PROCESO'), '-infinity')
     ) AS ok`,
    [idSolicitud],
  );
  return rows[0].ok;
}

/** Supervisores activos que supervisan la dependencia (destinatarios de avisos). */
async function supervisorsOfDependency(idDependencia, client) {
  const { rows } = await client.query(
    `SELECT u.id_usuario FROM supervision_dependencia sd JOIN usuarios u ON u.id_usuario = sd.id_supervisor
      WHERE sd.id_dependencia = $1 AND u.activo`,
    [idDependencia],
  );
  return rows.map((row) => row.id_usuario);
}

async function insertResponse({ idSolicitud, idUsuario, contenido, visibilidad }, client) {
  const { rows } = await client.query(
    'INSERT INTO respuestas (id_solicitud, id_usuario, contenido, visibilidad) VALUES ($1, $2, $3, $4) RETURNING id_respuesta',
    [idSolicitud, idUsuario, contenido, visibilidad],
  );
  return rows[0].id_respuesta;
}

const RESPONSE_SELECT = `
  SELECT r.id_respuesta, r.id_solicitud, r.id_usuario, (u.nombres || ' ' || u.apellidos) AS autor,
         r.contenido, r.visibilidad, r.creado_en
    FROM respuestas r JOIN usuarios u ON u.id_usuario = r.id_usuario`;

async function findResponseById(id, client = null) {
  const { rows } = await executor(client).query(`${RESPONSE_SELECT} WHERE r.id_respuesta = $1`, [id]);
  return rows[0] || null;
}

/** Respuestas en orden cronológico. `includeInternal` = false para el estudiante. */
async function listResponses(idSolicitud, includeInternal) {
  const { rows } = await db.query(
    `${RESPONSE_SELECT} WHERE r.id_solicitud = $1 ${includeInternal ? '' : "AND r.visibilidad = 'PUBLICA'"}
      ORDER BY r.creado_en ASC, r.id_respuesta ASC`,
    [idSolicitud],
  );
  return rows;
}

/** Historial de estados en orden cronológico, con el rol de quien actuó (para ocultar nombres al estudiante). */
async function listHistory(idSolicitud) {
  const { rows } = await db.query(
    `SELECT h.id_historial, h.id_solicitud, h.estado_anterior, h.estado_nuevo, h.id_usuario,
            (u.nombres || ' ' || u.apellidos) AS usuario, r.nombre AS rol_usuario,
            h.observacion, h.observacion_publica, h.fecha_cambio
       FROM historial_estados h
       JOIN usuarios u ON u.id_usuario = h.id_usuario
       JOIN roles r ON r.id_rol = u.id_rol
      WHERE h.id_solicitud = $1
      ORDER BY h.fecha_cambio ASC, h.id_historial ASC`,
    [idSolicitud],
  );
  return rows;
}

module.exports = {
  updateState, updatePriority, insertHistory, finishActiveAssignment, hasPublicResponseSinceStart,
  supervisorsOfDependency, insertResponse, findResponseById, listResponses, listHistory,
};
