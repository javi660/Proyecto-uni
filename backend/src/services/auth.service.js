'use strict';

const { withTransaction } = require('../config/database');
const { authConfig } = require('../config/auth');
const userRepository = require('../repositories/user.repository');
const tokenRepository = require('../repositories/token.repository');
const { recordAudit } = require('./audit.service');
const { AppError } = require('../utils/errors');
const { hashPassword, verifyPassword, verifyAgainstDummy } = require('../utils/password');
const {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} = require('../utils/tokens');
const { toRequestUser } = require('../utils/user.mapper');

/**
 * Reglas de negocio de autenticación (DECISIONES.md, sección 7).
 * Devuelve usuarios en la forma "de la petición" (toRequestUser) y los tokens que el
 * controlador convierte en cookies. Nunca devuelve password_hash.
 */

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
const invalidRefresh = () => new AppError(401, 'INVALID_REFRESH', 'Tu sesión ya no es válida. Inicia sesión nuevamente');

/**
 * Crea una sesión: guarda el HMAC del refresh token y firma un access token ligado a ella.
 * @returns {Promise<{accessToken: string, refreshToken: string, sessionId: number}>}
 */
async function issueSession(userId, client = null) {
  const refreshToken = generateRefreshToken();
  const row = await tokenRepository.create(
    {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + authConfig.refreshTtlMs),
    },
    client,
  );
  const accessToken = signAccessToken({ userId, sessionId: row.id_token });
  return { accessToken, refreshToken, sessionId: row.id_token };
}

/**
 * Inicio de sesión (12.2 del documento original):
 * busca el usuario, compara la contraseña, verifica que esté activo, crea la sesión y audita.
 * El mensaje es el mismo para "correo inexistente" y "contraseña incorrecta". La cuenta
 * desactivada solo se revela después de acertar la contraseña.
 *
 * @param {{correo: string, password: string, ip?: string}} params
 * @returns {Promise<{user: object, accessToken: string, refreshToken: string}>}
 */
async function login({ correo, password, ip = null }) {
  const row = await userRepository.findByEmail(correo);

  if (!row) {
    await verifyAgainstDummy(password); // iguala el tiempo de respuesta
    await recordAudit({
      operacion: 'LOGIN',
      recurso: 'sesion',
      resultado: 'FALLO',
      detalle: { motivo: 'CORREO_INEXISTENTE', correo },
      ip,
    });
    throw invalidCredentials();
  }

  const passwordOk = await verifyPassword(password, row.password_hash);
  if (!passwordOk) {
    await recordAudit({
      idUsuario: row.id_usuario,
      operacion: 'LOGIN',
      recurso: 'sesion',
      idRecurso: row.id_usuario,
      resultado: 'FALLO',
      detalle: { motivo: 'CONTRASENA_INCORRECTA' },
      ip,
    });
    throw invalidCredentials();
  }

  if (!row.activo || !row.rol_activo) {
    await recordAudit({
      idUsuario: row.id_usuario,
      operacion: 'LOGIN',
      recurso: 'sesion',
      idRecurso: row.id_usuario,
      resultado: 'FALLO',
      detalle: { motivo: 'CUENTA_DESACTIVADA' },
      ip,
    });
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Tu cuenta está desactivada. Comunícate con el administrador');
  }

  const session = await issueSession(row.id_usuario);

  // Mantenimiento: borra sesiones vencidas de este usuario (no bloquea el login si falla)
  tokenRepository.purgeExpired(row.id_usuario).catch(() => {});

  await recordAudit({
    idUsuario: row.id_usuario,
    operacion: 'LOGIN',
    recurso: 'sesion',
    idRecurso: row.id_usuario,
    resultado: 'EXITO',
    ip,
  });

  return {
    user: toRequestUser({ ...row, sessionId: session.sessionId }),
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
}

/**
 * Renueva la sesión con ROTACIÓN: el refresh token usado queda revocado y se entrega uno nuevo.
 * Si se presenta un refresh token que ya había sido revocado (reutilización: posible robo),
 * se revocan TODAS las sesiones del usuario.
 *
 * @param {{refreshToken: string|undefined, ip?: string}} params
 */
async function refresh({ refreshToken, ip = null }) {
  if (!refreshToken || typeof refreshToken !== 'string') {
    throw invalidRefresh();
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const consumed = await tokenRepository.consume(tokenHash);

  if (!consumed) {
    const existing = await tokenRepository.findByHash(tokenHash);
    if (existing && existing.revocado) {
      await tokenRepository.revokeAllForUser(existing.id_usuario);
      await recordAudit({
        idUsuario: existing.id_usuario,
        operacion: 'REFRESH_REUTILIZADO',
        recurso: 'sesion',
        idRecurso: existing.id_usuario,
        resultado: 'FALLO',
        detalle: { accion: 'Se revocaron todas las sesiones del usuario' },
        ip,
      });
    }
    throw invalidRefresh();
  }

  const row = await userRepository.findAuthUserById(consumed.id_usuario);
  if (!row || !row.activo || !row.rol_activo) {
    await tokenRepository.revokeAllForUser(consumed.id_usuario);
    throw invalidRefresh();
  }

  const session = await issueSession(row.id_usuario);
  return {
    user: toRequestUser({ ...row, sessionId: session.sessionId }),
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
}

/**
 * Cierre de sesión REAL: revoca el refresh token en la base de datos. Como el access token
 * está ligado a esa sesión, deja de ser válido de inmediato. No exige estar autenticado
 * (así se puede cerrar una sesión cuyo access token ya venció).
 *
 * @param {{refreshToken?: string, userId?: number|null, ip?: string}} params
 */
async function logout({ refreshToken, userId = null, ip = null }) {
  let revokedUserId = userId;

  if (refreshToken && typeof refreshToken === 'string') {
    const tokenHash = hashRefreshToken(refreshToken);
    const existing = await tokenRepository.findByHash(tokenHash);
    if (existing) {
      revokedUserId = existing.id_usuario;
      await tokenRepository.revokeByHash(tokenHash);
    }
  }

  if (revokedUserId) {
    await recordAudit({
      idUsuario: revokedUserId,
      operacion: 'LOGOUT',
      recurso: 'sesion',
      idRecurso: revokedUserId,
      resultado: 'EXITO',
      ip,
    });
  }
}

/**
 * Cambio de contraseña propio. Verifica la contraseña actual, guarda la nueva, marca que ya no
 * se exige cambiarla, REVOCA todas las sesiones y entrega una sesión nueva (todo en una transacción).
 *
 * @param {{userId: number, currentPassword: string, newPassword: string, ip?: string}} params
 */
async function changePassword({ userId, currentPassword, newPassword, ip = null }) {
  const row = await userRepository.findAuthUserById(userId);
  if (!row || !row.activo || !row.rol_activo) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión para continuar');
  }

  const currentOk = await verifyPassword(currentPassword, row.password_hash);
  if (!currentOk) {
    await recordAudit({
      idUsuario: userId,
      operacion: 'CAMBIO_PASSWORD',
      recurso: 'usuarios',
      idRecurso: userId,
      resultado: 'FALLO',
      detalle: { motivo: 'CONTRASENA_ACTUAL_INCORRECTA' },
      ip,
    });
    throw new AppError(422, 'INVALID_CURRENT_PASSWORD', 'La contraseña actual no es correcta');
  }

  const newHash = await hashPassword(newPassword);

  const session = await withTransaction(async (client) => {
    await userRepository.updatePassword(userId, newHash, client);
    await tokenRepository.revokeAllForUser(userId, client);
    return issueSession(userId, client);
  });

  await recordAudit({
    idUsuario: userId,
    operacion: 'CAMBIO_PASSWORD',
    recurso: 'usuarios',
    idRecurso: userId,
    resultado: 'EXITO',
    ip,
  });

  return {
    user: toRequestUser({ ...row, debe_cambiar_password: false, sessionId: session.sessionId }),
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
}

module.exports = { login, refresh, logout, changePassword };
