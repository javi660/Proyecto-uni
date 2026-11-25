'use strict';

const db = require('../config/database');
const { escapeLike, createWhere, toLimitOffset } = require('../utils/sql');

/**
 * Acceso a datos de usuarios. Solo este repositorio escribe SQL de la tabla usuarios.
 * Todas las consultas son parametrizadas. Cada función acepta opcionalmente un `client`
 * de transacción (withTransaction); sin él usa el pool.
 */

const executor = (client) => client || db;

// Campos de usuario + nombres de rol y dependencia
const USER_COLUMNS = `
  u.id_usuario, u.nombres, u.apellidos, u.correo, u.id_dependencia, u.activo,
  u.debe_cambiar_password, r.nombre AS rol, r.activo AS rol_activo, d.nombre AS dependencia`;

const USER_JOINS = `
  FROM usuarios u
  JOIN roles r ON r.id_rol = u.id_rol
  LEFT JOIN dependencias d ON d.id_dependencia = u.id_dependencia`;

/**
 * Busca por correo (ya normalizado a minúsculas). Incluye password_hash: SOLO para uso interno del login.
 * @returns {Promise<object|null>}
 */
async function findByEmail(correo, client = null) {
  const { rows } = await executor(client).query(
    `SELECT ${USER_COLUMNS}, u.password_hash ${USER_JOINS} WHERE u.correo = $1`,
    [correo],
  );
  return rows[0] || null;
}

/**
 * Busca por id. Incluye password_hash: SOLO para uso interno (cambio de contraseña).
 * @returns {Promise<object|null>}
 */
async function findAuthUserById(idUsuario, client = null) {
  const { rows } = await executor(client).query(
    `SELECT ${USER_COLUMNS}, u.password_hash ${USER_JOINS} WHERE u.id_usuario = $1`,
    [idUsuario],
  );
  return rows[0] || null;
}

/**
 * Carga el usuario de una sesión en UNA consulta e indica si la sesión sigue vigente
 * (su refresh token no está revocado ni vencido). No devuelve password_hash.
 * @returns {Promise<object|null>}
 */
async function findSessionUser(idUsuario, idSesion, client = null) {
  const { rows } = await executor(client).query(
    `SELECT ${USER_COLUMNS},
            EXISTS (
              SELECT 1 FROM refresh_tokens rt
               WHERE rt.id_token = $2 AND rt.id_usuario = u.id_usuario
                 AND NOT rt.revocado AND rt.expira_en > NOW()
            ) AS sesion_vigente
       ${USER_JOINS}
      WHERE u.id_usuario = $1`,
    [idUsuario, idSesion],
  );
  return rows[0] || null;
}

/** Cambia la contraseña y marca que ya no se exige cambiarla. */
async function updatePassword(idUsuario, passwordHash, client = null) {
  await executor(client).query(
    'UPDATE usuarios SET password_hash = $2, debe_cambiar_password = FALSE WHERE id_usuario = $1',
    [idUsuario, passwordHash],
  );
}

/**
 * Crea un usuario. El perfil se indica por nombre. Los triggers de la base validan la
 * coherencia perfil–dependencia (SG002).
 * @returns {Promise<{id_usuario: number}>}
 */
async function create(
  { nombres, apellidos, correo, passwordHash, rol, idDependencia = null, debeCambiarPassword = true },
  client = null,
) {
  const { rows } = await executor(client).query(
    `INSERT INTO usuarios (nombres, apellidos, correo, password_hash, id_rol, id_dependencia, debe_cambiar_password)
     VALUES ($1, $2, $3, $4, (SELECT id_rol FROM roles WHERE nombre = $5), $6, $7)
     RETURNING id_usuario`,
    [nombres, apellidos, correo, passwordHash, rol, idDependencia, debeCambiarPassword],
  );
  return rows[0];
}

/** Columnas públicas de usuario (nunca password_hash). */
const PUBLIC_COLUMNS = `
  u.id_usuario, u.nombres, u.apellidos, u.correo, r.nombre AS rol, u.id_dependencia,
  d.nombre AS dependencia, u.activo, u.debe_cambiar_password, u.creado_en, u.actualizado_en`;

/** Detalle de un usuario para administración (sin password_hash). */
async function findPublicById(idUsuario, client = null) {
  const { rows } = await executor(client).query(
    `SELECT ${PUBLIC_COLUMNS} ${USER_JOINS} WHERE u.id_usuario = $1`,
    [idUsuario],
  );
  return rows[0] || null;
}

/** Listado paginado con filtros (nunca devuelve password_hash). */
async function list({ q, activo, rol, idDependencia, page, pageSize }, client = null) {
  const where = createWhere();
  if (q) {
    where.add(
      `(u.nombres ILIKE $? ESCAPE '\\' OR u.apellidos ILIKE $? ESCAPE '\\' OR u.correo ILIKE $? ESCAPE '\\'
        OR (u.nombres || ' ' || u.apellidos) ILIKE $? ESCAPE '\\')`,
      `%${escapeLike(q)}%`,
    );
  }
  if (activo !== undefined) where.add('u.activo = $?', activo);
  if (rol !== undefined) where.add('r.nombre = $?', rol);
  if (idDependencia !== undefined) where.add('u.id_dependencia = $?', idDependencia);
  const { clause, params } = where.build();
  const { limit, offset } = toLimitOffset({ page, pageSize });

  const [{ rows }, { rows: count }] = await Promise.all([
    executor(client).query(
      `SELECT ${PUBLIC_COLUMNS} ${USER_JOINS} ${clause}
        ORDER BY u.apellidos ASC, u.nombres ASC, u.id_usuario ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    executor(client).query(`SELECT COUNT(*) AS total ${USER_JOINS} ${clause}`, params),
  ]);
  return { rows, total: count[0].total };
}

/** Actualiza datos y perfil. Los triggers validan la coherencia perfil–dependencia (SG002). */
async function updateProfile(idUsuario, { nombres, apellidos, correo, rol, idDependencia }, client = null) {
  const { rowCount } = await executor(client).query(
    `UPDATE usuarios
        SET nombres = $2, apellidos = $3, correo = $4,
            id_rol = (SELECT id_rol FROM roles WHERE nombre = $5), id_dependencia = $6
      WHERE id_usuario = $1`,
    [idUsuario, nombres, apellidos, correo, rol, idDependencia],
  );
  return rowCount > 0;
}

async function setActive(idUsuario, activo, client = null) {
  const { rowCount } = await executor(client).query('UPDATE usuarios SET activo = $2 WHERE id_usuario = $1', [idUsuario, activo]);
  return rowCount > 0;
}

/** Restablecimiento por el administrador: el usuario deberá cambiarla en su próximo ingreso. */
async function resetPassword(idUsuario, passwordHash, client = null) {
  const { rowCount } = await executor(client).query(
    'UPDATE usuarios SET password_hash = $2, debe_cambiar_password = TRUE WHERE id_usuario = $1',
    [idUsuario, passwordHash],
  );
  return rowCount > 0;
}

/** Administradores activos (con bloqueo de filas para evitar carreras al desactivar/degradar). */
async function lockActiveAdminIds(client) {
  const { rows } = await client.query(
    `SELECT u.id_usuario FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
      WHERE r.nombre = 'ADMINISTRADOR' AND u.activo FOR UPDATE OF u`,
  );
  return rows.map((row) => row.id_usuario);
}

async function countActiveAssignments(idFuncionario, client = null) {
  const { rows } = await executor(client).query(
    'SELECT COUNT(*) AS total FROM asignaciones WHERE id_funcionario = $1 AND activo',
    [idFuncionario],
  );
  return rows[0].total;
}

module.exports = {
  findByEmail,
  findAuthUserById,
  findSessionUser,
  updatePassword,
  create,
  findPublicById,
  list,
  updateProfile,
  setActive,
  resetPassword,
  lockActiveAdminIds,
  countActiveAssignments,
};
