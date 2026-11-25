'use strict';

/**
 * Formato uniforme de respuestas JSON de la API:
 *
 *   éxito: { ok: true,  data, error: null, meta? }
 *   error: { ok: false, data: null, error: { code, message, details } }
 *
 * `meta` solo se incluye en listados: { page, pageSize, total }.
 */

/**
 * @param {import('express').Response} res
 * @param {*} data
 * @param {{status?: number, meta?: object}} [options]
 */
function sendOk(res, data = null, { status = 200, meta } = {}) {
  const body = { ok: true, data, error: null };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

/** Respuesta 201 para recursos creados. */
function sendCreated(res, data = null) {
  return sendOk(res, data, { status: 201 });
}

/**
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} code
 * @param {string} message
 * @param {Array} [details]
 */
function sendError(res, status, code, message, details = []) {
  return res.status(status).json({
    ok: false,
    data: null,
    error: { code, message, details },
  });
}

/**
 * Calcula los metadatos de paginación.
 * @param {{page: number, pageSize: number, total: number}} values
 */
function buildMeta({ page, pageSize, total }) {
  return { page, pageSize, total };
}

module.exports = { sendOk, sendCreated, sendError, buildMeta };
