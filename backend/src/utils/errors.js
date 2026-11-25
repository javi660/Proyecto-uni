'use strict';

/**
 * Error de aplicación con código HTTP y código interno estable.
 * El mensaje (`message`) es el que verá el usuario final: debe estar en español
 * y no contener detalles internos (SQL, rutas, secretos).
 */
class AppError extends Error {
  /**
   * @param {number} status Código HTTP
   * @param {string} code Código interno estable (p. ej. 'VALIDATION_ERROR')
   * @param {string} message Mensaje para el usuario
   * @param {Array} [details] Detalles de validación u otros datos seguros
   */
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message = 'Los datos enviados no son válidos', details = []) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);

const unauthorized = (message = 'Debes iniciar sesión para continuar') =>
  new AppError(401, 'UNAUTHENTICATED', message);

const forbidden = (message = 'No tienes permisos para realizar esta acción') =>
  new AppError(403, 'FORBIDDEN', message);

const notFound = (message = 'El recurso solicitado no existe') =>
  new AppError(404, 'NOT_FOUND', message);

const conflict = (message = 'La operación entra en conflicto con el estado actual', code = 'CONFLICT') =>
  new AppError(409, code, message);

const unprocessable = (message = 'La operación no cumple las reglas de negocio', code = 'BUSINESS_RULE') =>
  new AppError(422, code, message);

const serviceUnavailable = (message = 'El servicio no está disponible en este momento', code = 'UNAVAILABLE') =>
  new AppError(503, code, message);

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessable,
  serviceUnavailable,
};
