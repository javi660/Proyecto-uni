'use strict';

const { authConfig } = require('../config/auth');
const { safeEqual, isValidCsrfToken } = require('../utils/tokens');
const { AppError } = require('../utils/errors');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protección CSRF por "doble envío de cookie firmado".
 *
 * Los métodos que cambian datos (POST, PUT, PATCH, DELETE) deben traer la cabecera
 * X-CSRF-Token con el mismo valor de la cookie `sgssu_csrf` (que el frontend obtiene en
 * GET /api/auth/csrf). Además la firma del token debe ser válida: así un atacante no puede
 * fijar una cookie propia. Un sitio externo no puede leer la cookie, y por tanto no puede
 * construir la cabecera.
 */
function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies && req.cookies[authConfig.cookies.csrf];
  const headerToken = req.get(authConfig.csrfHeader);

  const valid =
    typeof cookieToken === 'string' &&
    typeof headerToken === 'string' &&
    safeEqual(cookieToken, headerToken) &&
    isValidCsrfToken(cookieToken);

  if (!valid) {
    return next(new AppError(403, 'CSRF_INVALID', 'Solicitud no autorizada. Recarga la página e inténtalo de nuevo'));
  }
  return next();
}

module.exports = { csrfProtection };
