'use strict';

const { authConfig } = require('../config/auth');
const userRepository = require('../repositories/user.repository');
const { verifyAccessToken } = require('../utils/tokens');
const { toRequestUser } = require('../utils/user.mapper');
const { clearSessionCookies } = require('../utils/cookies');
const { AppError } = require('../utils/errors');

/**
 * Autentica la petición a partir de la cookie de acceso.
 *
 * En CADA petición:
 *  1. Verifica el JWT (firma HS256, emisor, vigencia).
 *  2. Carga el usuario desde la base de datos y comprueba que siga activo.
 *  3. Comprueba que la sesión (refresh token ligado) no esté revocada ni vencida.
 *  4. Toma el ROL de la base de datos (el token no lo contiene), así que un cambio de perfil
 *     o una desactivación surten efecto de inmediato.
 *
 * Deja el usuario en `req.user`. Por defecto bloquea (403) a quien deba cambiar su contraseña;
 * las rutas de autenticación que permiten hacerlo usan { allowPasswordChangePending: true }.
 *
 * Uso: router.get('/ruta', authenticate(), authorize(ROLES.ADMINISTRADOR), controlador)
 *
 * @param {{allowPasswordChangePending?: boolean}} [options]
 */
function authenticate({ allowPasswordChangePending = false } = {}) {
  return async (req, res, next) => {
    try {
      const token = req.cookies && req.cookies[authConfig.cookies.access];
      if (!token) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión para continuar');
      }

      const { userId, sessionId } = verifyAccessToken(token);
      const row = await userRepository.findSessionUser(userId, sessionId);

      if (!row || !row.activo || !row.rol_activo) {
        clearSessionCookies(res);
        throw new AppError(401, 'SESSION_INVALID', 'Tu sesión ya no es válida. Inicia sesión nuevamente');
      }

      if (!row.sesion_vigente) {
        clearSessionCookies(res);
        throw new AppError(401, 'SESSION_REVOKED', 'Tu sesión fue cerrada. Inicia sesión nuevamente');
      }

      req.user = toRequestUser({ ...row, sessionId });

      if (req.user.debeCambiarPassword && !allowPasswordChangePending) {
        throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Debes cambiar tu contraseña antes de continuar');
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { authenticate };
