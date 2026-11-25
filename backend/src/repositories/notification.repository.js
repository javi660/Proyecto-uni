'use strict';

const { query } = require('../config/database');
const { createWhere, toLimitOffset } = require('../utils/sql');

/** Inserción de notificaciones dentro de la transacción del hecho que las origina. */
async function insertMany(client, notifications) {
  for (const n of notifications) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO notificaciones (id_usuario, id_solicitud, titulo, mensaje, tipo) VALUES ($1, $2, $3, $4, $5)`,
      [n.idUsuario, n.idSolicitud, n.titulo, n.mensaje, n.tipo],
    );
  }
}

const COLUMNS = `n.id_notificacion, n.id_solicitud, s.codigo, n.titulo, n.mensaje, n.tipo, n.leida, n.creada_en`;
const FROM = `FROM notificaciones n LEFT JOIN solicitudes s ON s.id_solicitud = n.id_solicitud`;

/** Listado de las notificaciones de UN usuario (siempre filtrado por dueño), más recientes primero. */
async function listByUser(idUsuario, { page, pageSize, leida }) {
  const where = createWhere();
  where.add('n.id_usuario = $?', idUsuario);
  if (leida !== undefined) where.add('n.leida = $?', leida);
  const { clause, params } = where.build();
  const { limit, offset } = toLimitOffset({ page, pageSize });

  const [rows, count] = await Promise.all([
    query(
      `SELECT ${COLUMNS} ${FROM} ${clause}
        ORDER BY n.creada_en DESC, n.id_notificacion DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM notificaciones n ${clause}`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function countUnread(idUsuario) {
  const { rows } = await query('SELECT COUNT(*)::int AS total FROM notificaciones WHERE id_usuario = $1 AND NOT leida', [idUsuario]);
  return rows[0].total;
}

/** Marca como leída una notificación del usuario. Devuelve null si no existe o es de otro usuario. */
async function markRead(idNotificacion, idUsuario) {
  const { rows } = await query(
    `WITH upd AS (
       UPDATE notificaciones SET leida = TRUE WHERE id_notificacion = $1 AND id_usuario = $2 RETURNING *
     )
     SELECT ${COLUMNS} FROM upd n LEFT JOIN solicitudes s ON s.id_solicitud = n.id_solicitud`,
    [idNotificacion, idUsuario],
  );
  return rows[0] ?? null;
}

async function markAllRead(idUsuario) {
  const { rowCount } = await query('UPDATE notificaciones SET leida = TRUE WHERE id_usuario = $1 AND NOT leida', [idUsuario]);
  return rowCount;
}

module.exports = { insertMany, listByUser, countUnread, markRead, markAllRead };
