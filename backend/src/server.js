'use strict';

const { env } = require('./config/env');
const { createApp } = require('./app');
const { assertAuthSecrets } = require('./config/auth');
const { checkConnection, closePool } = require('./config/database');
const logger = require('./utils/logger');

// Falla rápido y con un mensaje claro si faltan los secretos de sesión
try {
  assertAuthSecrets();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const app = createApp();

const server = app.listen(env.PORT, async () => {
  logger.info(`SGSSU backend escuchando en el puerto ${env.PORT}`, {
    environment: env.NODE_ENV,
  });

  // Verificación informativa de la base de datos al arrancar.
  // Si falla, el servidor sigue en pie y /api/health/db reportará el problema.
  try {
    const { latencyMs } = await checkConnection();
    logger.info('Conexión a la base de datos verificada', { latencyMs });
  } catch (error) {
    logger.error('No se pudo conectar a la base de datos. Ejecuta "npm run check:db" para diagnosticar', {
      code: error.code,
    });
  }
});

// Cierre ordenado
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Señal ${signal} recibida. Cerrando servidor...`);

  server.close(async () => {
    try {
      await closePool();
    } finally {
      process.exit(0);
    }
  });

  // Si algo queda colgado, se fuerza la salida
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Promesa rechazada sin manejar', {
    name: reason && reason.name,
    code: reason && reason.code,
  });
});
