'use strict';

const { env } = require('../config/env');
const { checkConnection } = require('../config/database');
const { sendOk } = require('../utils/response');
const { serviceUnavailable } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * GET /api/health
 * Indica que el servidor Express está en ejecución. No toca la base de datos.
 */
function getHealth(req, res) {
  return sendOk(res, {
    status: 'ok',
    service: 'sgssu-backend',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/health/db
 * Comprueba la conexión con PostgreSQL (Supabase).
 * Es público, así que solo devuelve el estado y la latencia: ningún dato del servidor de base de datos.
 * El detalle completo se obtiene localmente con `npm run check:db`.
 */
async function getDatabaseHealth(req, res, next) {
  try {
    const { latencyMs } = await checkConnection();
    return sendOk(res, {
      status: 'ok',
      database: 'connected',
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Falló la comprobación de conexión a la base de datos', {
      code: error.code,
      name: error.name,
    });
    return next(
      serviceUnavailable('No fue posible conectar con la base de datos', 'DB_UNAVAILABLE'),
    );
  }
}

module.exports = { getHealth, getDatabaseHealth };
