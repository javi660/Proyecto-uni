'use strict';

const { loadEnv } = require('../src/config/env');
const { stripSslMode, buildSslOptions } = require('../src/config/database');
const { sendOk, sendCreated, sendError, buildMeta } = require('../src/utils/response');

describe('loadEnv', () => {
  it('aplica valores por defecto en modo test sin DATABASE_URL', () => {
    const config = loadEnv({ NODE_ENV: 'test' });

    expect(config.PORT).toBe(4000);
    expect(config.DB_SSL).toBe('require');
    expect(config.COOKIE_SECURE).toBe(false);
    expect(config.CORS_ORIGINS_LIST).toEqual(['http://localhost:5173']);
    expect(config.DATABASE_URL).toBeUndefined();
  });

  it('exige DATABASE_URL fuera del modo test', () => {
    expect(() => loadEnv({ NODE_ENV: 'development' })).toThrow(/DATABASE_URL/);
  });

  it('trata las cadenas vacías como no definidas', () => {
    const config = loadEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      JWT_ACCESS_SECRET: '',
      SUPABASE_URL: '',
    });

    expect(config.JWT_ACCESS_SECRET).toBeUndefined();
    expect(config.SUPABASE_URL).toBeUndefined();
  });

  it('rechaza secretos JWT demasiado cortos', () => {
    expect(() =>
      loadEnv({ NODE_ENV: 'test', JWT_ACCESS_SECRET: 'corto' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rechaza un modo SSL inválido y un puerto fuera de rango', () => {
    expect(() => loadEnv({ NODE_ENV: 'test', DB_SSL: 'cualquiera' })).toThrow(/DB_SSL/);
    expect(() => loadEnv({ NODE_ENV: 'test', PORT: '70000' })).toThrow(/PORT/);
  });

  it('separa varios orígenes CORS y convierte COOKIE_SECURE a booleano', () => {
    const config = loadEnv({
      NODE_ENV: 'test',
      CORS_ORIGINS: 'http://a.test, http://b.test ,',
      COOKIE_SECURE: 'true',
    });

    expect(config.CORS_ORIGINS_LIST).toEqual(['http://a.test', 'http://b.test']);
    expect(config.COOKIE_SECURE).toBe(true);
  });
});

describe('stripSslMode', () => {
  it('no cambia una URL sin sslmode', () => {
    const url = 'postgresql://u:p@host:5432/postgres';
    expect(stripSslMode(url)).toBe(url);
  });

  it('quita sslmode cuando es el único parámetro', () => {
    expect(stripSslMode('postgresql://u:p@host:5432/postgres?sslmode=require')).toBe(
      'postgresql://u:p@host:5432/postgres',
    );
  });

  it('quita sslmode al inicio, en medio y al final conservando los demás parámetros', () => {
    expect(stripSslMode('postgresql://u:p@h/db?sslmode=require&application_name=x')).toBe(
      'postgresql://u:p@h/db?application_name=x',
    );
    expect(stripSslMode('postgresql://u:p@h/db?a=1&sslmode=require&b=2')).toBe(
      'postgresql://u:p@h/db?a=1&b=2',
    );
    expect(stripSslMode('postgresql://u:p@h/db?a=1&sslmode=require')).toBe(
      'postgresql://u:p@h/db?a=1',
    );
  });
});

describe('buildSslOptions', () => {
  it('desactiva SSL con disable', () => {
    expect(buildSslOptions({ DB_SSL: 'disable' })).toBe(false);
  });

  it('cifra sin verificar certificado con require', () => {
    expect(buildSslOptions({ DB_SSL: 'require' })).toEqual({ rejectUnauthorized: false });
  });

  it('verifica el certificado con verify', () => {
    expect(buildSslOptions({ DB_SSL: 'verify' })).toEqual({ rejectUnauthorized: true });
  });
});

describe('helpers de respuesta', () => {
  function fakeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  it('sendOk entrega el formato uniforme con meta opcional', () => {
    const res = fakeRes();
    sendOk(res, [1], { meta: buildMeta({ page: 1, pageSize: 20, total: 1 }) });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      data: [1],
      error: null,
      meta: { page: 1, pageSize: 20, total: 1 },
    });
  });

  it('sendOk sin meta no incluye la clave meta', () => {
    const res = fakeRes();
    sendOk(res, { a: 1 });

    expect(res.json.mock.calls[0][0]).not.toHaveProperty('meta');
  });

  it('sendCreated usa 201', () => {
    const res = fakeRes();
    sendCreated(res, { id: 1 });

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('sendError entrega ok:false con code, message y details', () => {
    const res = fakeRes();
    sendError(res, 403, 'FORBIDDEN', 'Sin permisos');

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Sin permisos', details: [] },
    });
  });
});
