'use strict';

const { env } = require('./env');

/**
 * Parámetros de autenticación (DECISIONES.md, sección 7).
 * Los secretos se leen de las variables de entorno en el momento de usarlos.
 */
const authConfig = Object.freeze({
  issuer: 'sgssu',
  accessTtlSeconds: 15 * 60, // access token: 15 minutos
  refreshTtlMs: 7 * 24 * 60 * 60 * 1000, // refresh token: 7 días
  csrfTtlMs: 7 * 24 * 60 * 60 * 1000,
  cookies: Object.freeze({
    access: 'sgssu_at',
    refresh: 'sgssu_rt',
    csrf: 'sgssu_csrf',
  }),
  // El refresh token solo viaja a las rutas de autenticación
  refreshCookiePath: '/api/auth',
  csrfHeader: 'x-csrf-token',
  bcryptCost: env.BCRYPT_COST,
});

/**
 * Comprueba que los secretos de sesión estén configurados y sean distintos.
 * El servidor la ejecuta al arrancar para fallar rápido con un mensaje claro.
 * @param {{JWT_ACCESS_SECRET?: string, JWT_REFRESH_SECRET?: string}} [source]
 */
function assertAuthSecrets(source = env) {
  const problems = [];

  if (!source.JWT_ACCESS_SECRET) {
    problems.push('  - JWT_ACCESS_SECRET: es obligatoria (mínimo 32 caracteres)');
  }
  if (!source.JWT_REFRESH_SECRET) {
    problems.push('  - JWT_REFRESH_SECRET: es obligatoria (mínimo 32 caracteres)');
  }
  if (
    source.JWT_ACCESS_SECRET &&
    source.JWT_REFRESH_SECRET &&
    source.JWT_ACCESS_SECRET === source.JWT_REFRESH_SECRET
  ) {
    problems.push('  - JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben ser distintas');
  }

  if (problems.length > 0) {
    throw new Error(
      `Configuración de autenticación inválida:\n${problems.join('\n')}\n` +
        "  Genera un secreto con: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    );
  }
}

module.exports = { authConfig, assertAuthSecrets };
