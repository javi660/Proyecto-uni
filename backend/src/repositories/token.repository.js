'use strict';

const db = require('../config/database');

/**
 * Acceso a datos de refresh_tokens (sesiones revocables).
 * Solo se manejan HMAC de los tokens, nunca el valor original.
 */

const executor = (client) => client || db;

/**
 * Registra una sesión nueva.
 * @returns {Promise<{id_token: number}>}
 */
async function create({ userId, tokenHash, expiresAt }, client = null) {
  const { rows } = await executor(client).query(
    'INSERT INTO refresh_tokens (id_usuario, token_hash, expira_en) VALUES ($1, $2, $3) RETURNING id_token',
    [userId, tokenHash, expiresAt],
  );
  return rows[0];
}

/**
 * Consume un refresh token de forma ATÓMICA: lo revoca solo si estaba vigente.
 * Dos peticiones simultáneas con el mismo token no pueden ganar ambas.
 * @returns {Promise<{id_token: number, id_usuario: number}|null>} null si no estaba vigente
 */
async function consume(tokenHash, client = null) {
  const { rows } = await executor(client).query(
    `UPDATE refresh_tokens SET revocado = TRUE
      WHERE token_hash = $1 AND NOT revocado AND expira_en > NOW()
      RETURNING id_token, id_usuario`,
    [tokenHash],
  );
  return rows[0] || null;
}

/** @returns {Promise<{id_token: number, id_usuario: number, revocado: boolean, expira_en: Date}|null>} */
async function findByHash(tokenHash, client = null) {
  const { rows } = await executor(client).query(
    'SELECT id_token, id_usuario, revocado, expira_en FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash],
  );
  return rows[0] || null;
}

/** Revoca una sesión concreta (cierre de sesión). */
async function revokeByHash(tokenHash, client = null) {
  await executor(client).query('UPDATE refresh_tokens SET revocado = TRUE WHERE token_hash = $1', [tokenHash]);
}

/** Revoca todas las sesiones de un usuario. @returns {Promise<number>} cantidad revocada */
async function revokeAllForUser(userId, client = null) {
  const result = await executor(client).query(
    'UPDATE refresh_tokens SET revocado = TRUE WHERE id_usuario = $1 AND NOT revocado',
    [userId],
  );
  return result.rowCount;
}

/** Elimina las sesiones vencidas hace más de un día (mantenimiento oportunista). */
async function purgeExpired(userId, client = null) {
  await executor(client).query(
    "DELETE FROM refresh_tokens WHERE id_usuario = $1 AND expira_en < NOW() - INTERVAL '1 day'",
    [userId],
  );
}

module.exports = { create, consume, findByHash, revokeByHash, revokeAllForUser, purgeExpired };
