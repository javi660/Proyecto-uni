'use strict';

const { ZodError } = require('zod');
const { AppError, notFound } = require('../utils/errors');
const { sendError } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Middleware para rutas que no existen (se registra después de todas las rutas).
 */
function notFoundHandler(req, res, next) {
  next(notFound('La ruta solicitada no existe'));
}

/**
 * Traduce errores de PostgreSQL a respuestas HTTP seguras.
 * Nunca se devuelve el texto original del error SQL al cliente.
 * @returns {AppError|null}
 */
function mapDatabaseError(error) {
  switch (error.code) {
    case 'SG001': // transición de estado no permitida o solicitud en estado final (schema.sql)
      return new AppError(409, 'INVALID_TRANSITION', 'La operación no está permitida para el estado actual de la solicitud');
    case 'SG002': // regla de integridad de negocio (perfiles, dependencias, asignaciones)
      return new AppError(422, 'BUSINESS_RULE', 'La operación no cumple las reglas de negocio');
    case '23001': // restrict_violation: intento de modificar un registro de solo inserción
      return new AppError(409, 'IMMUTABLE_RECORD', 'Este registro no puede modificarse ni eliminarse');
    case '23505': // unique_violation
      return new AppError(409, 'CONFLICT', 'Ya existe un registro con esos datos');
    case '23503': // foreign_key_violation
      return new AppError(409, 'REFERENCE_CONFLICT', 'La operación referencia o afecta registros relacionados');
    case '23502': // not_null_violation
    case '23514': // check_violation
    case '22P02': // invalid_text_representation
      return new AppError(422, 'INVALID_DATA', 'Los datos no cumplen las restricciones permitidas');
    default:
      return null;
  }
}

// Errores de red y de conexión con PostgreSQL
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENETUNREACH',
  '57P01', '57P02', '57P03', // apagado o reinicio del servidor
  '08000', '08001', '08003', '08004', '08006', // fallos de conexión
]);
const CONNECTION_ERROR_MESSAGE = /connection terminated|timeout exceeded when trying to connect|connection.*(refused|reset)/i;

/** @returns {boolean} true si el error indica que no hay conexión con la base de datos */
function isDatabaseUnavailable(error) {
  return CONNECTION_ERROR_CODES.has(error.code) || CONNECTION_ERROR_MESSAGE.test(String(error.message || ''));
}

/**
 * Manejador de errores central. Debe registrarse al final de app.js.
 * eslint-disable-next-line no-unused-vars
 */
function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  // Errores de negocio controlados
  if (error instanceof AppError) {
    return sendError(res, error.status, error.code, error.message, error.details);
  }

  // Validación con Zod que no pasó por el middleware validate()
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return sendError(res, 400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', details);
  }

  // JSON mal formado en el cuerpo de la petición
  if (error.type === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_JSON', 'El cuerpo de la petición no es un JSON válido');
  }

  // Cuerpo demasiado grande
  if (error.type === 'entity.too.large') {
    return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'La petición supera el tamaño permitido');
  }

  // Errores de PostgreSQL conocidos
  const databaseError = mapDatabaseError(error);
  if (databaseError) {
    logger.warn('Error de base de datos controlado', { code: error.code, path: req.path });
    return sendError(res, databaseError.status, databaseError.code, databaseError.message);
  }

  // La base de datos no responde (caída, red, pool agotado): 503 en lugar de 500
  if (isDatabaseUnavailable(error)) {
    logger.error('Base de datos no disponible', { code: error.code, path: req.path });
    return sendError(res, 503, 'DB_UNAVAILABLE', 'El servicio no está disponible en este momento. Intenta nuevamente');
  }

  // Error inesperado: se registra internamente y se responde sin detalles
  logger.error('Error interno no controlado', {
    name: error.name,
    code: error.code,
    method: req.method,
    path: req.path,
  });
  return sendError(res, 500, 'INTERNAL_ERROR', 'Ocurrió un error interno. Intenta nuevamente más tarde');
}

module.exports = { errorHandler, notFoundHandler, mapDatabaseError };
