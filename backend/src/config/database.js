'use strict';

/**
 * Acceso a PostgreSQL (Supabase como PostgreSQL alojado) mediante la librería `pg`.
 *
 * - Todas las consultas deben ser parametrizadas: query('... WHERE id = $1', [id]).
 * - Las operaciones críticas usan withTransaction() para ser atómicas.
 * - El pool se crea la primera vez que se necesita (no al importar el módulo).
 */

const fs = require('fs');
const { Pool, types } = require('pg');
const { env } = require('./env');
const logger = require('../utils/logger');

// pg devuelve BIGINT (int8) como texto. Todos los identificadores y conteos del proyecto
// caben holgadamente en un número JavaScript, así que se convierten para que la API
// entregue números y no cadenas.
types.setTypeParser(types.builtins.INT8, (value) => parseInt(value, 10));

let pool = null;

/**
 * Quita el parámetro `sslmode` de la URL para que el SSL se controle solo con DB_SSL.
 * (pg da prioridad a sslmode de la URL sobre la opción `ssl` y eso causa confusiones.)
 * @param {string} url
 */
function stripSslMode(url) {
  return url
    .replace(/([?&])sslmode=[^&]*&?/i, (match, separator) => (match.endsWith('&') ? separator : ''))
    .replace(/[?&]$/, '');
}

/**
 * Construye la opción `ssl` de pg según DB_SSL.
 * @param {{DB_SSL: string, DB_SSL_CA?: string}} config
 */
function buildSslOptions(config) {
  if (config.DB_SSL === 'disable') return false;

  if (config.DB_SSL === 'verify') {
    const options = { rejectUnauthorized: true };
    if (config.DB_SSL_CA) {
      options.ca = fs.readFileSync(config.DB_SSL_CA, 'utf8');
    }
    return options;
  }

  // 'require': conexión cifrada sin verificar la cadena de certificados
  return { rejectUnauthorized: false };
}

function getPool() {
  if (pool) return pool;

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está configurada');
  }

  pool = new Pool({
    connectionString: stripSslMode(env.DATABASE_URL),
    ssl: buildSslOptions(env),
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  // Un error en un cliente inactivo no debe tumbar el proceso
  pool.on('error', (error) => {
    logger.error('Error inesperado en un cliente inactivo del pool', { code: error.code });
  });

  return pool;
}

/**
 * Ejecuta una consulta parametrizada.
 * @param {string} text
 * @param {Array} [params]
 */
function query(text, params = []) {
  return getPool().query(text, params);
}

/**
 * Ejecuta `work(client)` dentro de una transacción.
 * Hace COMMIT si termina bien y ROLLBACK si lanza un error (que se vuelve a lanzar).
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} work
 * @returns {Promise<T>}
 */
async function withTransaction(work) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Falló el ROLLBACK de la transacción', { code: rollbackError.code });
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Comprueba que la base responde. Devuelve la latencia en milisegundos.
 * Lanza el error original si no hay conexión.
 */
async function checkConnection() {
  const startedAt = Date.now();
  await query('SELECT 1 AS ok');
  return { latencyMs: Date.now() - startedAt };
}

/** Cierra el pool (cierre ordenado del servidor y de las pruebas). */
async function closePool() {
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}

module.exports = {
  query,
  withTransaction,
  checkConnection,
  closePool,
  // Exportadas para pruebas unitarias
  stripSslMode,
  buildSslOptions,
};
