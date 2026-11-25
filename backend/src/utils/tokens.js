'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { authConfig } = require('../config/auth');
const { AppError } = require('./errors');

/**
 * Tokens de sesión:
 *  - Access token: JWT firmado (HS256) de 15 minutos. Contiene SOLO el id del usuario (`sub`)
 *    y el id de la sesión (`sid` = fila de refresh_tokens). El rol NUNCA va en el token:
 *    se lee de la base de datos en cada petición.
 *  - Refresh token: cadena aleatoria opaca. En la base solo se guarda su HMAC-SHA256
 *    (con JWT_REFRESH_SECRET), nunca el valor original.
 *  - Token CSRF: nonce aleatorio firmado con HMAC (doble envío de cookie firmado).
 */

function getSecrets() {
  const access = env.JWT_ACCESS_SECRET;
  const refresh = env.JWT_REFRESH_SECRET;
  if (!access || !refresh) {
    throw new Error('JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben estar configuradas');
  }
  return { access, refresh };
}

// ---------------------------------------------------------------------------
// Access token
// ---------------------------------------------------------------------------

/**
 * @param {{userId: number|string, sessionId: number|string}} params
 * @returns {string}
 */
function signAccessToken({ userId, sessionId }) {
  return jwt.sign({ sid: String(sessionId) }, getSecrets().access, {
    algorithm: 'HS256',
    subject: String(userId),
    issuer: authConfig.issuer,
    expiresIn: authConfig.accessTtlSeconds,
  });
}

/**
 * Verifica firma, algoritmo, emisor y vigencia.
 * @param {string} token
 * @returns {{userId: string, sessionId: string}}
 * @throws {AppError} 401 TOKEN_EXPIRED o 401 UNAUTHENTICATED
 */
function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, getSecrets().access, {
      algorithms: ['HS256'],
      issuer: authConfig.issuer,
    });

    if (!payload.sub || !payload.sid) {
      throw new Error('Token incompleto');
    }
    return { userId: String(payload.sub), sessionId: String(payload.sid) };
  } catch (error) {
    if (error && error.name === 'TokenExpiredError') {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Tu sesión expiró. Renueva la sesión para continuar');
    }
    throw new AppError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión para continuar');
  }
}

// ---------------------------------------------------------------------------
// Refresh token
// ---------------------------------------------------------------------------

/** @returns {string} 384 bits de aleatoriedad, en base64url */
function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

/**
 * HMAC-SHA256 del refresh token: es lo único que se guarda en la base de datos.
 * @param {string} token
 * @returns {string} hexadecimal de 64 caracteres
 */
function hashRefreshToken(token) {
  return crypto.createHmac('sha256', getSecrets().refresh).update(String(token)).digest('hex');
}

// ---------------------------------------------------------------------------
// CSRF (doble envío de cookie firmado)
// ---------------------------------------------------------------------------

function csrfSignature(nonce) {
  return crypto.createHmac('sha256', getSecrets().access).update(`csrf:${nonce}`).digest('base64url');
}

/** @returns {string} `nonce.firma` */
function generateCsrfToken() {
  const nonce = crypto.randomBytes(24).toString('base64url');
  return `${nonce}.${csrfSignature(nonce)}`;
}

/**
 * Comprueba que el token tenga la forma `nonce.firma` y que la firma sea válida
 * (impide que un atacante fije una cookie CSRF propia).
 * @param {string} token
 */
function isValidCsrfToken(token) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  return safeEqual(parts[1], csrfSignature(parts[0]));
}

// ---------------------------------------------------------------------------
// Utilidad
// ---------------------------------------------------------------------------

/** Comparación de cadenas en tiempo constante. */
function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  generateCsrfToken,
  isValidCsrfToken,
  safeEqual,
};
