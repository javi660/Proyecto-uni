'use strict';

const express = require('express');
const request = require('supertest');
const { errorHandler, mapDatabaseError } = require('../src/middleware/errorHandler');
const { DB_ERROR_CODES } = require('../src/utils/constants');

function appThatFailsWith(code, message) {
  const app = express();
  app.get('/fail', (req, res, next) => {
    const error = new Error(message);
    error.code = code;
    next(error);
  });
  app.use(errorHandler);
  return app;
}

describe('traducción de errores de PostgreSQL a HTTP', () => {
  const cases = [
    ['SG001', 409, 'INVALID_TRANSITION'],
    ['SG002', 422, 'BUSINESS_RULE'],
    ['23001', 409, 'IMMUTABLE_RECORD'],
    ['23505', 409, 'CONFLICT'],
    ['23503', 409, 'REFERENCE_CONFLICT'],
    ['23514', 422, 'INVALID_DATA'],
    ['23502', 422, 'INVALID_DATA'],
  ];

  it.each(cases)('el código %s responde %i con %s', async (code, status, apiCode) => {
    const res = await request(appThatFailsWith(code, 'detalle interno: tabla solicitudes, restricción ck_x')).get('/fail');

    expect(res.status).toBe(status);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe(apiCode);
  });

  it.each(cases)('el código %s nunca expone el texto interno del error', async (code) => {
    const res = await request(appThatFailsWith(code, 'tabla solicitudes restricción ck_x trigger trg_y')).get('/fail');

    expect(JSON.stringify(res.body)).not.toMatch(/solicitudes|ck_x|trg_y|trigger/i);
  });

  it('un código desconocido se trata como error interno 500', async () => {
    const res = await request(appThatFailsWith('XX000', 'fallo raro')).get('/fail');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('mapDatabaseError devuelve null para códigos no mapeados', () => {
    expect(mapDatabaseError({ code: '42P01' })).toBeNull();
  });

  it('los códigos de constants.js coinciden con los que traduce el manejador', () => {
    expect(mapDatabaseError({ code: DB_ERROR_CODES.INVALID_TRANSITION }).status).toBe(409);
    expect(mapDatabaseError({ code: DB_ERROR_CODES.BUSINESS_RULE }).status).toBe(422);
    expect(mapDatabaseError({ code: DB_ERROR_CODES.RESTRICT_VIOLATION }).status).toBe(409);
  });
});
