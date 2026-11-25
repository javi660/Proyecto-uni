'use strict';

/**
 * Conversión de filas de la base de datos a las dos formas de usuario que usa el backend:
 *  - "usuario de la petición" (req.user): camelCase interno.
 *  - "usuario público": lo que devuelve la API. Nunca incluye password_hash.
 *    Los nombres de campo de la API replican los de la base de datos (español, snake_case).
 */

/**
 * @param {object} row Fila con los campos de usuario + `rol` y `dependencia` (nombres)
 */
function toRequestUser(row) {
  return {
    id: row.id_usuario,
    nombres: row.nombres,
    apellidos: row.apellidos,
    correo: row.correo,
    rol: row.rol,
    idDependencia: row.id_dependencia ?? null,
    dependencia: row.dependencia ?? null,
    debeCambiarPassword: Boolean(row.debe_cambiar_password),
    sessionId: row.sessionId ?? null,
  };
}

/** @param {ReturnType<typeof toRequestUser>} user */
function toPublicUser(user) {
  return {
    id_usuario: user.id,
    nombres: user.nombres,
    apellidos: user.apellidos,
    correo: user.correo,
    rol: user.rol,
    id_dependencia: user.idDependencia,
    dependencia: user.dependencia,
    debe_cambiar_password: user.debeCambiarPassword,
  };
}

module.exports = { toRequestUser, toPublicUser };
