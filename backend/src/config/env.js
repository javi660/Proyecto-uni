'use strict';

/**
 * Carga y valida las variables de entorno del backend.
 * Si falta o es inválida una variable obligatoria, el servidor no arranca
 * y muestra un mensaje claro (sin imprimir valores secretos).
 */

const path = require('path');
const { z } = require('zod');

if (process.env.NODE_ENV !== 'test') {
  // Carga backend/.env (la ruta es fija para no depender del directorio de ejecución)
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
}

// Cadena vacía en el .env => se trata como "no definida"
const emptyToUndefined = (value) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalSecret = z.preprocess(
  emptyToUndefined,
  z.string().min(32, 'debe tener al menos 32 caracteres').optional(),
);

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  DATABASE_URL: optionalString,
  TEST_DATABASE_URL: optionalString,
  DB_SSL: z.enum(['require', 'verify', 'disable']).default('require'),
  DB_SSL_CA: optionalString,
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),

  // Costo de bcrypt (12 recomendado; las pruebas usan 4 para ir más rápido)
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  // Número de proxies de confianza delante del backend (0 = ninguno). Afecta a req.ip.
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

  JWT_ACCESS_SECRET: optionalSecret,
  JWT_REFRESH_SECRET: optionalSecret,
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  SUPABASE_URL: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  STORAGE_BUCKET: z.string().default('sgssu-adjuntos'),
});

/**
 * Valida un objeto de variables (por defecto process.env) y devuelve la configuración.
 * @param {Record<string, string|undefined>} source
 */
function loadEnv(source = process.env) {
  const parsed = baseSchema.safeParse(source);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${problems}`);
  }

  const config = parsed.data;

  const problems = [];

  // DATABASE_URL es obligatoria salvo en pruebas unitarias sin base de datos
  if (config.NODE_ENV !== 'test' && !config.DATABASE_URL) {
    problems.push('  - DATABASE_URL: es obligatoria (revisa backend/.env.example)');
  }

  // En producción las cookies de sesión deben viajar solo por HTTPS
  if (config.NODE_ENV === 'production' && !config.COOKIE_SECURE) {
    problems.push('  - COOKIE_SECURE: debe ser true en producción');
  }

  if (problems.length > 0) {
    throw new Error(`Configuración de entorno inválida:\n${problems.join('\n')}`);
  }

  return {
    ...config,
    CORS_ORIGINS_LIST: config.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    IS_PRODUCTION: config.NODE_ENV === 'production',
  };
}

const env = loadEnv();

module.exports = { env, loadEnv };
