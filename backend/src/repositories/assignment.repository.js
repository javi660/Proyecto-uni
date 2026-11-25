'use strict';

const db = require('../config/database');
const { escapeLike, createWhere, toLimitOffset } = require('../utils/sql');

/** Acceso a datos de asignaciones y de los funcionarios asignables. */

const executor = (client) => client || db;

/** Funcionario con los datos necesarios para validar una asignación. */
async function findOfficialById(id, client = null) {
  const { rows } = await executor(client).query(
    `SELECT u.id_usuario, u.nombres, u.apellidos, u.activo, u.id_dependencia, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
      WHERE u.id_usuario = $1`,
    [id],
  );
  return rows[0] || null;
}

/**
 * Funcionarios activos. `supervisorId` limita a las dependencias que supervisa ese supervisor.
 * `carga_activa` = solicitudes abiertas que tiene a cargo (apoyo para repartir el trabajo).
 */
async function listOfficials({ q, idDependencia, supervisorId, page, pageSize }) {
  const where = createWhere();
  where.addRaw("r.nombre = 'FUNCIONARIO'");
  where.addRaw('u.activo = TRUE');
  if (idDependencia !== undefined) where.add('u.id_dependencia = $?', idDependencia);
  if (supervisorId !== undefined) {
    where.add('u.id_dependencia IN (SELECT sd.id_dependencia FROM supervision_dependencia sd WHERE sd.id_supervisor = $?)', supervisorId);
  }
  if (q) {
    where.add(
      `((u.nombres || ' ' || u.apellidos) ILIKE $? ESCAPE '\\' OR u.correo ILIKE $? ESCAPE '\\')`,
      `%${escapeLike(q)}%`,
    );
  }
  const { clause, params } = where.build();
  const { limit, offset } = toLimitOffset({ page, pageSize });
  const from = 'FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol JOIN dependencias d ON d.id_dependencia = u.id_dependencia';
  const [{ rows }, { rows: count }] = await Promise.all([
    db.query(
      `SELECT u.id_usuario, u.nombres, u.apellidos, u.correo, u.id_dependencia, d.nombre AS dependencia,
              (SELECT COUNT(*) FROM asignaciones a JOIN solicitudes s ON s.id_solicitud = a.id_solicitud
                WHERE a.id_funcionario = u.id_usuario AND a.activo AND s.estado IN ('ASIGNADA','EN_PROCESO','REABIERTA')) AS carga_activa
         ${from} ${clause} ORDER BY u.apellidos, u.nombres, u.id_usuario LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    db.query(`SELECT COUNT(*) AS total ${from} ${clause}`, params),
  ]);
  return { rows: rows.map((row) => ({ ...row, carga_activa: Number(row.carga_activa) })), total: count[0].total };
}

/** Finaliza la asignación activa de la solicitud (si existe). Devuelve el funcionario que la tenía. */
async function finishActive(idSolicitud, client) {
  const { rows } = await client.query(
    `UPDATE asignaciones SET activo = FALSE, finalizado_en = clock_timestamp()
      WHERE id_solicitud = $1 AND activo RETURNING id_asignacion, id_funcionario`,
    [idSolicitud],
  );
  return rows[0] || null;
}

async function insert({ idSolicitud, idFuncionario, idAsignador, observacion }, client) {
  const { rows } = await client.query(
    `INSERT INTO asignaciones (id_solicitud, id_funcionario, id_asignador, observacion)
     VALUES ($1, $2, $3, $4) RETURNING id_asignacion`,
    [idSolicitud, idFuncionario, idAsignador, observacion],
  );
  return rows[0].id_asignacion;
}

async function setRequestState(idSolicitud, estado, client) {
  await client.query('UPDATE solicitudes SET estado = $2 WHERE id_solicitud = $1', [idSolicitud, estado]);
}

async function insertStateHistory({ idSolicitud, estadoAnterior, estadoNuevo, idUsuario, observacion }, client) {
  await client.query(
    `INSERT INTO historial_estados (id_solicitud, estado_anterior, estado_nuevo, id_usuario, observacion)
     VALUES ($1, $2, $3, $4, $5)`,
    [idSolicitud, estadoAnterior, estadoNuevo, idUsuario, observacion],
  );
}

async function listByRequest(idSolicitud) {
  const { rows } = await db.query(
    `SELECT a.id_asignacion, a.id_solicitud, a.id_funcionario, (f.nombres || ' ' || f.apellidos) AS funcionario,
            a.id_asignador, (g.nombres || ' ' || g.apellidos) AS asignador,
            a.asignado_en, a.finalizado_en, a.activo, a.observacion
       FROM asignaciones a
       JOIN usuarios f ON f.id_usuario = a.id_funcionario
       JOIN usuarios g ON g.id_usuario = a.id_asignador
      WHERE a.id_solicitud = $1
      ORDER BY a.asignado_en DESC, a.id_asignacion DESC`,
    [idSolicitud],
  );
  return rows;
}

module.exports = { findOfficialById, listOfficials, finishActive, insert, setRequestState, insertStateHistory, listByRequest };
