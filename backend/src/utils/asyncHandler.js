'use strict';

/**
 * Envuelve un controlador asíncrono para que cualquier error o promesa rechazada
 * llegue al manejador central de errores (Express 4 no lo hace por sí solo).
 * @param {(req, res, next) => Promise<any>} handler
 */
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
