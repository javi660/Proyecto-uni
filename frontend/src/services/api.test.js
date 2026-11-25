import axios from 'axios';
import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Se reemplaza el adaptador de Axios ANTES de importar api.js, para simular el servidor
 * sin red y registrar cada petición que sale.
 */
let calls;
let routes;

function respond(config, status, body) {
  const response = { data: body, status, statusText: String(status), headers: {}, config, request: {} };
  if (status >= 200 && status < 300) return Promise.resolve(response);
  return Promise.reject(new axios.AxiosError(`HTTP ${status}`, 'ERR_BAD_REQUEST', config, {}, response));
}

const errorBody = (code, message = 'Error') => ({ ok: false, data: null, error: { code, message, details: [] } });

async function loadApi() {
  vi.resetModules();
  axios.defaults.adapter = (config) => {
    const key = `${(config.method || 'get').toUpperCase()} ${config.url}`;
    calls.push({ key, headers: config.headers });
    const handler = routes[key];
    if (!handler) return respond(config, 404, errorBody('NOT_FOUND'));
    return handler(config);
  };
  return import('./api.js');
}

beforeEach(() => {
  calls = [];
  routes = {};
  document.cookie = 'sgssu_csrf=; Max-Age=0; path=/';
});

describe('CSRF', () => {
  test('las peticiones que cambian datos llevan X-CSRF-Token tomado de la cookie', async () => {
    document.cookie = 'sgssu_csrf=abc.def; path=/';
    routes['POST /things'] = (c) => respond(c, 200, { ok: true });
    const { default: api } = await loadApi();
    await api.post('/things', {});
    expect(calls[0].headers.get('X-CSRF-Token')).toBe('abc.def');
  });

  test('si no hay cookie, primero solicita GET /auth/csrf y luego envía el token', async () => {
    routes['GET /auth/csrf'] = (c) => {
      document.cookie = 'sgssu_csrf=nuevo.firma; path=/';
      return respond(c, 200, { ok: true, data: { csrf_token: 'nuevo.firma' } });
    };
    routes['POST /things'] = (c) => respond(c, 200, { ok: true });
    const { default: api } = await loadApi();
    await api.post('/things', {});
    expect(calls.map((c) => c.key)).toEqual(['GET /auth/csrf', 'POST /things']);
    expect(calls[1].headers.get('X-CSRF-Token')).toBe('nuevo.firma');
  });

  test('las peticiones GET no piden ni envían CSRF', async () => {
    routes['GET /things'] = (c) => respond(c, 200, { ok: true });
    const { default: api } = await loadApi();
    await api.get('/things');
    expect(calls.map((c) => c.key)).toEqual(['GET /things']);
    expect(calls[0].headers.get('X-CSRF-Token')).toBeFalsy();
  });
});

describe('renovación automática de la sesión', () => {
  test('401 por token ausente/vencido => renueva una vez y repite la petición', async () => {
    document.cookie = 'sgssu_csrf=t.s; path=/';
    let attempts = 0;
    routes['GET /data'] = (c) => {
      attempts += 1;
      return attempts === 1 ? respond(c, 401, errorBody('TOKEN_EXPIRED')) : respond(c, 200, { ok: true, data: 'listo' });
    };
    routes['POST /auth/refresh'] = (c) => respond(c, 200, { ok: true });
    const { default: api } = await loadApi();

    const res = await api.get('/data');
    expect(res.data.data).toBe('listo');
    expect(calls.map((c) => c.key)).toEqual(['GET /data', 'POST /auth/refresh', 'GET /data']);
  });

  test('varias peticiones que fallan a la vez comparten UNA sola renovación', async () => {
    document.cookie = 'sgssu_csrf=t.s; path=/';
    const seen = {};
    const flaky = (c) => {
      seen[c.url] = (seen[c.url] || 0) + 1;
      return seen[c.url] === 1 ? respond(c, 401, errorBody('UNAUTHENTICATED')) : respond(c, 200, { ok: true });
    };
    routes['GET /a'] = flaky;
    routes['GET /b'] = flaky;
    routes['GET /c'] = flaky;
    routes['POST /auth/refresh'] = (c) => respond(c, 200, { ok: true });
    const { default: api } = await loadApi();

    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(calls.filter((c) => c.key === 'POST /auth/refresh')).toHaveLength(1);
  });

  test('si la renovación falla, avisa que la sesión expiró y rechaza con ApiError', async () => {
    document.cookie = 'sgssu_csrf=t.s; path=/';
    routes['GET /data'] = (c) => respond(c, 401, errorBody('TOKEN_EXPIRED', 'Sesión vencida'));
    routes['POST /auth/refresh'] = (c) => respond(c, 401, errorBody('INVALID_REFRESH'));
    const { default: api, setSessionExpiredHandler, ApiError } = await loadApi();
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);

    await expect(api.get('/data')).rejects.toBeInstanceOf(ApiError);
    expect(onExpired).toHaveBeenCalledTimes(1);
    // No reintenta en bucle: una petición, una renovación
    expect(calls.map((c) => c.key)).toEqual(['GET /data', 'POST /auth/refresh']);
  });

  test('los errores de login (401) NO disparan renovación', async () => {
    document.cookie = 'sgssu_csrf=t.s; path=/';
    routes['POST /auth/login'] = (c) => respond(c, 401, errorBody('INVALID_CREDENTIALS', 'Credenciales inválidas'));
    const { default: api } = await loadApi();
    await expect(api.post('/auth/login', {})).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' });
    expect(calls.map((c) => c.key)).toEqual(['POST /auth/login']);
  });

  test('sesión revocada (SESSION_REVOKED) avisa sin intentar renovar', async () => {
    routes['GET /data'] = (c) => respond(c, 401, errorBody('SESSION_REVOKED'));
    const { default: api, setSessionExpiredHandler } = await loadApi();
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    await expect(api.get('/data')).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
  });
});

describe('normalización de errores', () => {
  test('sin respuesta del servidor => NETWORK_ERROR en español', async () => {
    routes['GET /x'] = () => Promise.reject(new axios.AxiosError('Network Error', 'ERR_NETWORK'));
    const { default: api } = await loadApi();
    await expect(api.get('/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  test('respuesta que no sigue el formato de la API => UNEXPECTED_RESPONSE', async () => {
    routes['GET /x'] = (c) => respond(c, 502, '<html>Bad gateway</html>');
    const { default: api } = await loadApi();
    await expect(api.get('/x')).rejects.toMatchObject({ status: 502, code: 'UNEXPECTED_RESPONSE' });
  });
});
