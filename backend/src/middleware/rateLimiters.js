'use strict';

const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');
const { sendError } = require('../utils/response');

/**
 * Crea un limitador de peticiones por IP con el formato de error uniforme de la API.
 * @param {{windowMs?: number, limit: number, skipSuccessfulRequests?: boolean, message?: string}} options
 */
function createLimiter({
  windowMs = 15 * 60 * 1000,
  limit,
  skipSuccessfulRequests = false,
  message = 'Demasiados intentos. Intenta nuevamente en unos minutos',
}) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => sendError(res, 429, 'RATE_LIMITED', message),
  });
}

const isTest = env.NODE_ENV === 'test';

/** Login: 10 intentos FALLIDOS cada 15 minutos por IP (los exitosos no cuentan). */
const loginLimiter = createLimiter({
  limit: isTest ? 100000 : 10,
  skipSuccessfulRequests: true,
  message: 'Demasiados intentos de inicio de sesión. Intenta nuevamente en 15 minutos',
});

/** Cambio de contraseña: 10 intentos fallidos cada 15 minutos por IP. */
const passwordLimiter = createLimiter({
  limit: isTest ? 100000 : 10,
  skipSuccessfulRequests: true,
  message: 'Demasiados intentos de cambio de contraseña. Intenta nuevamente en 15 minutos',
});

module.exports = { createLimiter, loginLimiter, passwordLimiter };
