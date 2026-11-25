'use strict';

const request = require('supertest');

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

const ADM = 'ADMINISTRADOR';
const EST = 'ESTUDIANTE';
const FUN = 'FUNCIONARIO';
const SUP = 'SUPERVISOR';
const ALL = [ADM, EST, FUN, SUP];
const PUBLIC = 'PUBLIC';

/**
 * Matriz de acceso de TODAS las rutas de la API (DECISIONES §3 y §7). Es la fuente de verdad de la revisión de
 * seguridad: si alguien agrega una ruta sin clasificarla aquí, la prueba de cobertura falla.
 *   - lista de perfiles: solo ellos pasan el control de permisos; los demás reciben 403.
 *   - ALL: cualquier usuario autenticado pasa el middleware; el alcance lo decide el servicio (404/403 por recurso).
 *   - PUBLIC: sin sesión.
 *   - SESSION: exige sesión pero no se prueba por perfil (terminaría la sesión).
 */
const MATRIX = [
  ['GET', '/api/health', PUBLIC], ['GET', '/api/health/db', PUBLIC],
  ['GET', '/api/auth/csrf', PUBLIC], ['POST', '/api/auth/login', PUBLIC], ['POST', '/api/auth/refresh', PUBLIC],
  ['POST', '/api/auth/logout', 'SESSION'], ['GET', '/api/auth/me', ALL], ['PATCH', '/api/auth/password', ALL],
  ['GET', '/api/users', [ADM]], ['POST', '/api/users', [ADM]], ['GET', '/api/users/:id', [ADM]], ['PUT', '/api/users/:id', [ADM]],
  ['PATCH', '/api/users/:id/status', [ADM]], ['PATCH', '/api/users/:id/password-reset', [ADM]],
  ['GET', '/api/users/:id/supervision', [ADM]], ['PUT', '/api/users/:id/supervision', [ADM]],
  ['GET', '/api/dependencies', ALL], ['GET', '/api/dependencies/:id', ALL], ['POST', '/api/dependencies', [ADM]],
  ['PUT', '/api/dependencies/:id', [ADM]], ['PATCH', '/api/dependencies/:id/status', [ADM]],
  ['GET', '/api/categories', ALL], ['GET', '/api/categories/:id', ALL], ['POST', '/api/categories', [ADM]],
  ['PUT', '/api/categories/:id', [ADM]], ['PATCH', '/api/categories/:id/status', [ADM]],
  ['GET', '/api/services', ALL], ['GET', '/api/services/:id', ALL], ['POST', '/api/services', [ADM]],
  ['PUT', '/api/services/:id', [ADM]], ['PATCH', '/api/services/:id/status', [ADM]],
  ['POST', '/api/requests', [EST]], ['GET', '/api/requests/my', [EST]], ['GET', '/api/requests', ALL], ['GET', '/api/requests/:id', ALL],
  ['GET', '/api/requests/:id/attachments', ALL], ['POST', '/api/requests/:id/attachments', [EST, FUN]],
  ['GET', '/api/requests/:id/assignments', ALL], ['POST', '/api/requests/:id/assignment', [ADM, SUP]],
  ['PATCH', '/api/requests/:id/status', ALL], ['PATCH', '/api/requests/:id/priority', ALL],
  ['GET', '/api/requests/:id/responses', ALL], ['POST', '/api/requests/:id/responses', [FUN]], ['GET', '/api/requests/:id/timeline', ALL],
  ['GET', '/api/attachments/:id/download', ALL], ['GET', '/api/officials', [ADM, SUP]],
  ['GET', '/api/notifications', ALL], ['GET', '/api/notifications/unread-count', ALL],
  ['PATCH', '/api/notifications/read-all', ALL], ['PATCH', '/api/notifications/:id/read', ALL],
  ['GET', '/api/reports/by-status', [ADM, FUN, SUP]], ['GET', '/api/reports/by-category', [ADM, FUN, SUP]],
  ['GET', '/api/reports/by-dependency', [ADM, FUN, SUP]], ['GET', '/api/reports/by-period', [ADM, FUN, SUP]],
  ['GET', '/api/dashboard', ALL],
  ['GET', '/api/audit', [ADM]], ['GET', '/api/audit/filters', [ADM]], ['GET', '/api/audit/:id', [ADM]],
];

/** Recorre el enrutador de Express y devuelve "MÉTODO /ruta" de todas las rutas montadas. */
function listRoutes(app) {
  const out = [];
  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) out.push(`${method.toUpperCase()} ${prefix}${layer.route.path === '/' ? '' : layer.route.path}`);
      } else if (layer.name === 'router' && layer.handle.stack) {
        const mount = layer.regexp.source.replace('^\\', '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');
        walk(layer.handle.stack, prefix + (mount.startsWith('/') ? mount : `/${mount}`));
      }
    }
  };
  walk(app._router.stack, '');
  return out.sort();
}

describeDb('Revisión de seguridad (PostgreSQL real)', () => {
  const PASSWORD = 'Valida12345';
  const sufijo = Date.now().toString(36);
  let app;
  let query;
  let closePool;
  const sessions = {};

  async function login(correo, password = PASSWORD) {
    const agent = request.agent(app);
    const csrf = (await agent.get('/api/auth/csrf')).body.data.csrf_token;
    const res = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ correo, password });
    return { agent, csrf, res };
  }
  const send = (who, method, url, body) => {
    let req = who.agent[method.toLowerCase()](url);
    if (method !== 'GET') req = req.set('X-CSRF-Token', who.csrf);
    return body === undefined ? req : req.send(body);
  };
  const concrete = (path) => path.replace(':id', '999999999');

  beforeAll(async () => {
    const { createApp } = require('../../src/app');
    ({ query, closePool } = require('../../src/config/database'));
    const userRepository = require('../../src/repositories/user.repository');
    const { hashPassword } = require('../../src/utils/password');
    app = createApp();
    const hash = await hashPassword(PASSWORD);
    const dep = (await query("INSERT INTO dependencias (nombre) VALUES ($1) RETURNING id_dependencia", [`Dep Seg ${sufijo}`])).rows[0].id_dependencia;
    const mk = (rol, key, idDependencia = null) => userRepository.create({
      nombres: key, apellidos: 'Seguridad', correo: `${key}-${sufijo}@prueba.edu`, passwordHash: hash, rol, idDependencia, debeCambiarPassword: false,
    });
    await mk(ADM, 'adm');
    await mk(EST, 'est');
    await mk(FUN, 'fun', dep);
    await mk(SUP, 'sup');
    for (const [role, key] of [[ADM, 'adm'], [EST, 'est'], [FUN, 'fun'], [SUP, 'sup']]) {
      sessions[role] = await login(`${key}-${sufijo}@prueba.edu`);
      expect(sessions[role].res.status).toBe(200);
    }
  });

  afterAll(async () => {
    if (closePool) await closePool();
  });

  describe('matriz de acceso por ruta y perfil', () => {
    test('cobertura: todas las rutas de la API están clasificadas (y no sobra ninguna)', () => {
      const declared = MATRIX.map(([method, path]) => `${method} ${path}`).sort();
      expect(listRoutes(app)).toEqual(declared);
    });

    test.each(MATRIX.filter(([, , access]) => access !== PUBLIC && access !== 'SESSION'))('sin sesión → 401: %s %s', async (method, path) => {
      const anon = request.agent(app);
      const csrf = (await anon.get('/api/auth/csrf')).body.data.csrf_token;
      let req = anon[method.toLowerCase()](concrete(path));
      if (method !== 'GET') req = req.set('X-CSRF-Token', csrf);
      const res = await req;
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules/);
    });

    test('logout sin sesión es idempotente (200) y no revela nada', async () => {
      const anon = request.agent(app);
      const csrf = (await anon.get('/api/auth/csrf')).body.data.csrf_token;
      const res = await anon.post('/api/auth/logout').set('X-CSRF-Token', csrf);
      expect([200, 204]).toContain(res.status);
    });

    const roleCases = [];
    for (const [method, path, access] of MATRIX) {
      if (access === PUBLIC || access === 'SESSION') continue;
      for (const role of ALL) roleCases.push([method, path, role, access.includes(role)]);
    }
    test.each(roleCases)('%s %s como %s (permitido: %s)', async (method, path, role, allowed) => {
      const body = method === 'GET' ? undefined : {};
      const res = await send(sessions[role], method, concrete(path), body);
      if (allowed) {
        expect([401, 403]).not.toContain(res.status);
      } else {
        expect(res.status).toBe(403);
        expect(res.body.ok).toBe(false);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });
  });

  describe('cabeceras, CORS y cookies', () => {
    test('cabeceras de seguridad y sin huella del servidor', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['referrer-policy']).toBeDefined();
    });

    test('las respuestas de la API no se guardan en caché (contienen datos personales)', async () => {
      for (const [who, url] of [[sessions[ADM], '/api/users'], [sessions[EST], '/api/notifications'], [sessions[EST], '/api/auth/me']]) {
        const res = await send(who, 'GET', url);
        expect(res.headers['cache-control']).toMatch(/no-store/);
      }
      expect((await request(app).get('/api/nada')).headers['cache-control']).toMatch(/no-store/);
    });

    test('CORS: solo el origen configurado, con credenciales', async () => {
      const allowed = process.env.CORS_ORIGIN || 'http://localhost:5173';
      const ok = await request(app).get('/api/health').set('Origin', allowed);
      expect(ok.headers['access-control-allow-origin']).toBe(allowed);
      expect(ok.headers['access-control-allow-credentials']).toBe('true');
      const bad = await request(app).get('/api/health').set('Origin', 'https://evil.example');
      expect(bad.headers['access-control-allow-origin']).toBeUndefined();
      const pre = await request(app).options('/api/users').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
      expect(pre.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('cookies de sesión: HttpOnly, SameSite=Lax y refresh limitada a /api/auth', async () => {
      const cookies = sessions[EST].res.headers['set-cookie'];
      const at = cookies.find((c) => c.startsWith('sgssu_at='));
      const rt = cookies.find((c) => c.startsWith('sgssu_rt='));
      for (const cookie of [at, rt]) {
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Lax/i);
      }
      expect(rt).toMatch(/Path=\/api\/auth/);
      expect(JSON.stringify(sessions[EST].res.body)).not.toMatch(/eyJ/); // el token nunca viaja en el cuerpo
    });

    test('mutación sin token CSRF → 403 CSRF_INVALID aunque haya sesión', async () => {
      const res = await sessions[ADM].agent.post('/api/dependencies').send({ nombre: 'X' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });
  });

  describe('entradas hostiles', () => {
    test('cuerpo demasiado grande → 413 y JSON genérico', async () => {
      const res = await send(sessions[EST], 'POST', '/api/requests', { asunto: 'x', descripcion: 'y'.repeat(1_200_000) });
      expect(res.status).toBe(413);
      expect(res.body.ok).toBe(false);
      expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules|at /);
    });

    test('JSON mal formado → 400 sin detalles internos', async () => {
      const res = await sessions[EST].agent.post('/api/requests').set('X-CSRF-Token', sessions[EST].csrf).set('Content-Type', 'application/json').send('{"asunto": ');
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules|SyntaxError/);
    });

    test('__proto__ y campos de más no se aceptan ni contaminan el servidor', async () => {
      const res = await sessions[EST].agent.post('/api/requests').set('X-CSRF-Token', sessions[EST].csrf).set('Content-Type', 'application/json')
        .send('{"__proto__": {"polluted": true}, "id_servicio": 1, "asunto": "a", "descripcion": "b"}');
      expect([400, 422]).toContain(res.status);
      expect({}.polluted).toBeUndefined();
    });

    test('texto con comillas y SQL en filtros se trata como dato (200, sin error ni fuga)', async () => {
      const evil = encodeURIComponent("' OR '1'='1'; DROP TABLE solicitudes; --");
      for (const url of [`/api/requests?q=${evil}`, `/api/users?q=${evil}`, `/api/audit?operacion=${evil}`, `/api/dependencies?q=${evil}`]) {
        const res = await send(sessions[ADM], 'GET', url);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
      }
      expect((await query("SELECT to_regclass('public.solicitudes') AS t")).rows[0].t).not.toBeNull();
    });

    test('identificadores inválidos → 400 (no 500)', async () => {
      for (const id of ['abc', '-1', '0', '1.5', '99999999999999999999']) {
        const res = await send(sessions[ADM], 'GET', `/api/requests/${id}`);
        expect(res.status).toBe(400);
      }
    });

    test('ruta inexistente → 404 JSON', async () => {
      const res = await send(sessions[ADM], 'GET', '/api/no-existe');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('fuga de datos sensibles', () => {
    test('ninguna respuesta de usuarios o sesión incluye contraseñas, hashes ni tokens', async () => {
      const bodies = [
        (await send(sessions[ADM], 'GET', '/api/users?pageSize=100')).body,
        (await send(sessions[EST], 'GET', '/api/auth/me')).body,
        sessions[EST].res.body,
      ];
      for (const body of bodies) expect(JSON.stringify(body)).not.toMatch(/password_hash|passwordHash|"password"|refresh_token|\$2[aby]\$/i);
    });

    test('el login fallido se audita (FALLO) sin guardar la contraseña intentada', async () => {
      const intento = 'ContraseñaIncorrecta999';
      const fail = await login(`est-${sufijo}@prueba.edu`, intento);
      expect(fail.res.status).toBe(401);
      const { rows } = await query("SELECT detalle::text AS detalle, resultado FROM auditoria WHERE operacion = 'LOGIN' AND resultado = 'FALLO' ORDER BY id_auditoria DESC LIMIT 5");
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.detalle ?? '').not.toContain(intento);
      const all = await query('SELECT COUNT(*)::int AS n FROM auditoria WHERE detalle::text ILIKE $1', [`%${intento}%`]);
      expect(all.rows[0].n).toBe(0);
    });

    test('crear un usuario audita sin la contraseña inicial', async () => {
      const inicial = 'InicialSecreta12345';
      const res = await send(sessions[ADM], 'POST', '/api/users', {
        nombres: 'Nuevo', apellidos: 'Usuario', correo: `nuevo-${sufijo}@prueba.edu`, rol: EST, password_inicial: inicial,
      });
      expect(res.status).toBe(201);
      const all = await query('SELECT COUNT(*)::int AS n FROM auditoria WHERE detalle::text ILIKE $1', [`%${inicial}%`]);
      expect(all.rows[0].n).toBe(0);
      expect(JSON.stringify(res.body)).not.toContain(inicial);
    });
  });
});
