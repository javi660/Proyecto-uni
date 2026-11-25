'use strict';

jest.mock('../src/config/database', () => ({
  checkConnection: jest.fn(),
  query: jest.fn(),
  withTransaction: jest.fn(),
  closePool: jest.fn(),
}));

const request = require('supertest');
const { createApp } = require('../src/app');
const database = require('../src/config/database');

const app = createApp();

describe('GET /api/health', () => {
  it('responde 200 con el formato uniforme y sin tocar la base de datos', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.error).toBeNull();
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.service).toBe('sgssu-backend');
    expect(typeof res.body.data.timestamp).toBe('string');
    expect(database.checkConnection).not.toHaveBeenCalled();
  });

  it('incluye las cabeceras de seguridad de helmet y oculta x-powered-by', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('GET /api/health/db', () => {
  it('responde 200 cuando la base de datos responde', async () => {
    database.checkConnection.mockResolvedValue({ latencyMs: 12 });

    const res = await request(app).get('/api/health/db');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.database).toBe('connected');
    expect(res.body.data.latencyMs).toBe(12);
  });

  it('responde 503 genérico cuando falla la conexión, sin filtrar detalles internos', async () => {
    const internal = new Error('password authentication failed for user "postgres" at db.secret.supabase.co');
    internal.code = '28P01';
    database.checkConnection.mockRejectedValue(internal);

    const res = await request(app).get('/api/health/db');

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('DB_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toMatch(/password|secret|supabase|28P01/i);
  });
});

describe('rutas inexistentes y errores generales', () => {
  it('responde 404 con el formato uniforme', async () => {
    const res = await request(app).get('/api/no-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      ok: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe', details: [] },
    });
  });

  it('responde 400 ante un JSON mal formado', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"roto":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('CORS', () => {
  it('permite el origen configurado con credenciales', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('no concede acceso a un origen no configurado', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://sitio-malicioso.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
