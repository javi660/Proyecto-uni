'use strict';

const express = require('express');
const request = require('supertest');
const { z } = require('zod');
const { validate } = require('../src/middleware/validate');
const { errorHandler } = require('../src/middleware/errorHandler');
const { AppError, conflict } = require('../src/utils/errors');

function buildApp() {
  const app = express();
  app.use(express.json());

  app.post(
    '/items/:id',
    validate({
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
      body: z.object({ nombre: z.string().trim().min(3, 'Mínimo 3 caracteres') }),
    }),
    (req, res) => res.json({ validated: req.validated, body: req.body }),
  );

  app.get('/boom', () => {
    throw new Error('detalle interno que no debe salir: SELECT * FROM usuarios');
  });
  app.get('/conflict', (req, res, next) => next(conflict('Estado no permitido', 'INVALID_TRANSITION')));
  app.get('/pg-unique', (req, res, next) => {
    const error = new Error('duplicate key value violates unique constraint "usuarios_correo_key"');
    error.code = '23505';
    next(error);
  });

  app.use(errorHandler);
  return app;
}

describe('middleware validate', () => {
  const app = buildApp();

  it('deja pasar datos válidos y entrega los valores transformados en req.validated', async () => {
    const res = await request(app).post('/items/7?page=2').send({ nombre: '  Constancia  ' });

    expect(res.status).toBe(200);
    expect(res.body.validated.params.id).toBe(7);
    expect(res.body.validated.query.page).toBe(2);
    expect(res.body.validated.body.nombre).toBe('Constancia');
    expect(res.body.body.nombre).toBe('Constancia');
  });

  it('aplica valores por defecto', async () => {
    const res = await request(app).post('/items/1').send({ nombre: 'Certificado' });

    expect(res.status).toBe(200);
    expect(res.body.validated.query.page).toBe(1);
  });

  it('responde 400 con el detalle de cada campo inválido y su ubicación', async () => {
    const res = await request(app).post('/items/abc').send({ nombre: 'ab' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    const locations = res.body.error.details.map((d) => d.in).sort();
    expect(locations).toEqual(['body', 'params']);
    expect(res.body.error.details.find((d) => d.in === 'body').message).toBe('Mínimo 3 caracteres');
  });
});

describe('errorHandler', () => {
  const app = buildApp();

  it('devuelve el código y mensaje de un AppError', async () => {
    const res = await request(app).get('/conflict');

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: 'INVALID_TRANSITION',
      message: 'Estado no permitido',
      details: [],
    });
  });

  it('traduce un error de unicidad de PostgreSQL a 409 sin exponer el SQL', async () => {
    const res = await request(app).get('/pg-unique');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(JSON.stringify(res.body)).not.toMatch(/usuarios_correo_key|duplicate key/i);
  });

  it('responde 500 genérico ante un error inesperado', async () => {
    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/SELECT|usuarios/i);
  });

  it('AppError conserva status, código y detalles', () => {
    const error = new AppError(422, 'BUSINESS_RULE', 'Regla incumplida', [{ field: 'x' }]);

    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(422);
    expect(error.code).toBe('BUSINESS_RULE');
    expect(error.details).toEqual([{ field: 'x' }]);
  });
});
