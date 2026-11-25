'use strict';

jest.mock('../src/repositories/user.repository');
jest.mock('../src/repositories/token.repository');
jest.mock('../src/repositories/audit.repository');
jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  closePool: jest.fn(),
  withTransaction: jest.fn(async (fn) => fn({ fake: true })),
}));

const request = require('supertest');
const express = require('express');
const userRepository = require('../src/repositories/user.repository');
const tokenRepository = require('../src/repositories/token.repository');
const auditRepository = require('../src/repositories/audit.repository');
const { createApp } = require('../src/app');
const { authenticate } = require('../src/middleware/authenticate');
const { authorize, requirePermission } = require('../src/middleware/authorize');
const { csrfProtection } = require('../src/middleware/csrf');
const { createLimiter } = require('../src/middleware/rateLimiters');
const { hashPassword } = require('../src/utils/password');
const { signAccessToken } = require('../src/utils/tokens');
const { ROLES } = require('../src/utils/constants');
const { PERMISSIONS } = require('../src/utils/permissions');

const PASSWORD = 'Valida12345';
let baseRow;

const makeRow = (over = {}) => ({
  id_usuario: 1, nombres: 'Ana', apellidos: 'Pérez', correo: 'ana@uni.edu', password_hash: baseRow.password_hash,
  activo: true, rol: ROLES.ESTUDIANTE, rol_activo: true, id_dependencia: null, dependencia: null,
  debe_cambiar_password: false, sesion_vigente: true, ...over,
});

const buildApp = () => createApp({
  registerRoutes: (app) => {
    app.get('/api/_t/any', authenticate(), (req, res) => res.json({ rol: req.user.rol }));
    app.get('/api/_t/admin', authenticate(), authorize(ROLES.ADMINISTRADOR), (req, res) => res.json({ ok: true }));
    app.get('/api/_t/perm', authenticate(), requirePermission(PERMISSIONS.REPORTS_VIEW), (req, res) => res.json({ ok: true }));
    app.post('/api/_t/write', (req, res) => res.json({ ok: true }));
  },
});

async function csrf(agent) {
  const res = await agent.get('/api/auth/csrf');
  return res.body.data.csrf_token;
}

beforeAll(async () => {
  baseRow = { password_hash: await hashPassword(PASSWORD) };
});

beforeEach(() => {
  userRepository.findByEmail.mockResolvedValue(makeRow());
  userRepository.findAuthUserById.mockResolvedValue(makeRow());
  userRepository.findSessionUser.mockResolvedValue(makeRow());
  userRepository.updatePassword.mockResolvedValue();
  tokenRepository.create.mockResolvedValue({ id_token: 7 });
  tokenRepository.purgeExpired.mockResolvedValue(0);
  tokenRepository.revokeAllForUser.mockResolvedValue();
  tokenRepository.revokeByHash.mockResolvedValue();
  auditRepository.insert.mockResolvedValue();
});

describe('POST /api/auth/login', () => {
  test('éxito: cookies HttpOnly, sin tokens ni password_hash en el cuerpo', async () => {
    const agent = request.agent(buildApp());
    const token = await csrf(agent);
    const res = await agent.post('/api/auth/login').set('X-CSRF-Token', token).send({ correo: 'ANA@uni.edu', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id_usuario: 1, correo: 'ana@uni.edu', rol: ROLES.ESTUDIANTE });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/password_hash|"password"/);
    expect(res.body.data).not.toHaveProperty('accessToken');

    const cookies = res.headers['set-cookie'];
    const at = cookies.find((c) => c.startsWith('sgssu_at='));
    const rt = cookies.find((c) => c.startsWith('sgssu_rt='));
    expect(at).toMatch(/HttpOnly/i);
    expect(at).toMatch(/SameSite=Lax/i);
    expect(at).toMatch(/Path=\/;/);
    expect(rt).toMatch(/HttpOnly/i);
    expect(rt).toMatch(/Path=\/api\/auth/);
    expect(auditRepository.insert).toHaveBeenCalledWith(expect.objectContaining({ operacion: 'LOGIN', resultado: 'EXITO' }));
  });

  test('correo inexistente y contraseña incorrecta dan EXACTAMENTE la misma respuesta', async () => {
    const agent = request.agent(buildApp());
    const token = await csrf(agent);

    userRepository.findByEmail.mockResolvedValue(null);
    const a = await agent.post('/api/auth/login').set('X-CSRF-Token', token).send({ correo: 'no@uni.edu', password: PASSWORD });
    userRepository.findByEmail.mockResolvedValue(makeRow());
    const b = await agent.post('/api/auth/login').set('X-CSRF-Token', token).send({ correo: 'ana@uni.edu', password: 'Incorrecta123' });

    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
    expect(a.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(a.body.error.message).toBe('Credenciales inválidas');
  });

  test('cuenta desactivada con contraseña correcta => 403; con contraseña incorrecta => 401 genérico', async () => {
    userRepository.findByEmail.mockResolvedValue(makeRow({ activo: false }));
    const agent = request.agent(buildApp());
    const token = await csrf(agent);

    const ok = await agent.post('/api/auth/login').set('X-CSRF-Token', token).send({ correo: 'ana@uni.edu', password: PASSWORD });
    expect(ok.status).toBe(403);
    expect(ok.body.error.code).toBe('ACCOUNT_DISABLED');
    expect(ok.headers['set-cookie']).toBeUndefined();

    const bad = await agent.post('/api/auth/login').set('X-CSRF-Token', token).send({ correo: 'ana@uni.edu', password: 'Incorrecta123' });
    expect(bad.status).toBe(401);
  });

  test('validación: 400 con cuerpo inválido o campos extra', async () => {
    const agent = request.agent(buildApp());
    const token = await csrf(agent);
    const r1 = await agent.post('/api/auth/login').set('X-CSRF-Token', token).send({ correo: 'x' });
    const r2 = await agent.post('/api/auth/login').set('X-CSRF-Token', token).send({ correo: 'a@b.co', password: 'x', rol: 'ADMINISTRADOR' });
    expect(r1.status).toBe(400);
    expect(r2.status).toBe(400);
  });

  test('sin token CSRF => 403 CSRF_INVALID', async () => {
    const res = await request(buildApp()).post('/api/auth/login').send({ correo: 'ana@uni.edu', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });
});

describe('CSRF', () => {
  test('cabecera que no coincide con la cookie, o cookie sin firma válida => 403', async () => {
    const app = buildApp();
    const agent = request.agent(app);
    const token = await csrf(agent);
    const mismatch = await agent.post('/api/_t/write').set('X-CSRF-Token', `${token}x`).send({});
    expect(mismatch.status).toBe(403);

    const forged = 'nonce-falso.firma-falsa';
    const res = await request(app).post('/api/_t/write').set('Cookie', `sgssu_csrf=${forged}`).set('X-CSRF-Token', forged).send({});
    expect(res.status).toBe(403);
  });

  test('con token válido pasa; GET no lo exige', async () => {
    const app = buildApp();
    const agent = request.agent(app);
    const token = await csrf(agent);
    expect((await agent.post('/api/_t/write').set('X-CSRF-Token', token).send({})).status).toBe(200);
    expect((await request(app).get('/api/health')).status).not.toBe(403);
  });

  test('GET /csrf reutiliza el token vigente', async () => {
    const agent = request.agent(buildApp());
    const t1 = await csrf(agent);
    const t2 = await csrf(agent);
    expect(t2).toBe(t1);
  });
});

describe('authenticate / authorize', () => {
  const withSession = (agent, userId = 1, sessionId = 7) =>
    agent.set('Cookie', `sgssu_at=${signAccessToken({ userId, sessionId })}`);

  test('sin cookie => 401 UNAUTHENTICATED', async () => {
    const res = await request(buildApp()).get('/api/_t/any');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('token inválido => 401', async () => {
    const res = await request(buildApp()).get('/api/_t/any').set('Cookie', 'sgssu_at=basura');
    expect(res.status).toBe(401);
  });

  test('el rol se lee de la base de datos, no del token', async () => {
    userRepository.findSessionUser.mockResolvedValue(makeRow({ rol: ROLES.SUPERVISOR }));
    const res = await withSession(request(buildApp()).get('/api/_t/any'));
    expect(res.body.rol).toBe(ROLES.SUPERVISOR);
    expect(userRepository.findSessionUser).toHaveBeenCalledWith('1', '7');
  });

  test.each([
    [ROLES.ADMINISTRADOR, 200, 200],
    [ROLES.SUPERVISOR, 403, 200],
    [ROLES.FUNCIONARIO, 403, 200],
    [ROLES.ESTUDIANTE, 403, 403],
  ])('%s: /admin => %s, /perm(reportes) => %s', async (rol, adminStatus, permStatus) => {
    userRepository.findSessionUser.mockResolvedValue(makeRow({ rol }));
    const app = buildApp();
    expect((await withSession(request(app).get('/api/_t/admin'))).status).toBe(adminStatus);
    expect((await withSession(request(app).get('/api/_t/perm'))).status).toBe(permStatus);
  });

  test('usuario desactivado, rol inactivo o sesión revocada => 401', async () => {
    const app = buildApp();
    userRepository.findSessionUser.mockResolvedValue(makeRow({ activo: false }));
    expect((await withSession(request(app).get('/api/_t/any'))).body.error.code).toBe('SESSION_INVALID');
    userRepository.findSessionUser.mockResolvedValue(makeRow({ rol_activo: false }));
    expect((await withSession(request(app).get('/api/_t/any'))).status).toBe(401);
    userRepository.findSessionUser.mockResolvedValue(makeRow({ sesion_vigente: false }));
    const res = await withSession(request(app).get('/api/_t/any'));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_REVOKED');
    userRepository.findSessionUser.mockResolvedValue(null);
    expect((await withSession(request(app).get('/api/_t/any'))).status).toBe(401);
  });

  test('debe_cambiar_password bloquea rutas normales (403) pero permite /me', async () => {
    userRepository.findSessionUser.mockResolvedValue(makeRow({ debe_cambiar_password: true }));
    const app = buildApp();
    const blocked = await withSession(request(app).get('/api/_t/any'));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const me = await withSession(request(app).get('/api/auth/me'));
    expect(me.status).toBe(200);
    expect(me.body.data.user.debe_cambiar_password).toBe(true);
  });

  test('authorize/requirePermission sin req.user => 401', () => {
    const next = jest.fn();
    authorize(ROLES.ADMINISTRADOR)({}, {}, next);
    requirePermission(PERMISSIONS.AUDIT_VIEW)({}, {}, next);
    expect(next.mock.calls.every(([e]) => e.status === 401)).toBe(true);
  });
});

describe('refresh, logout y cambio de contraseña', () => {
  test('refresh válido rota el token y entrega cookies nuevas', async () => {
    tokenRepository.consume.mockResolvedValue({ id_usuario: 1 });
    const res = await request(buildApp()).post('/api/auth/refresh').set('Cookie', 'sgssu_rt=abc').send();
    // refresh exige CSRF al ser POST
    expect(res.status).toBe(403);

    const agent = request.agent(buildApp());
    const token = await csrf(agent);
    const ok = await agent.post('/api/auth/refresh').set('Cookie', [`sgssu_csrf=${token}`, 'sgssu_rt=abc'].join('; ')).set('X-CSRF-Token', token).send();
    expect(ok.status).toBe(200);
    expect(ok.headers['set-cookie'].some((c) => c.startsWith('sgssu_rt='))).toBe(true);
  });

  test('reutilización de un refresh revocado revoca TODAS las sesiones y audita', async () => {
    tokenRepository.consume.mockResolvedValue(null);
    tokenRepository.findByHash.mockResolvedValue({ id_usuario: 1, revocado: true });
    const agent = request.agent(buildApp());
    const token = await csrf(agent);
    const res = await agent.post('/api/auth/refresh').set('Cookie', [`sgssu_csrf=${token}`, 'sgssu_rt=viejo'].join('; ')).set('X-CSRF-Token', token).send();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH');
    expect(tokenRepository.revokeAllForUser).toHaveBeenCalledWith(1);
    expect(auditRepository.insert).toHaveBeenCalledWith(expect.objectContaining({ operacion: 'REFRESH_REUTILIZADO' }));
  });

  test('refresh sin cookie o desconocido => 401 sin revocar nada', async () => {
    tokenRepository.consume.mockResolvedValue(null);
    tokenRepository.findByHash.mockResolvedValue(null);
    const agent = request.agent(buildApp());
    const token = await csrf(agent);
    const res = await agent.post('/api/auth/refresh').set('X-CSRF-Token', token).send();
    expect(res.status).toBe(401);
    const res2 = await agent.post('/api/auth/refresh').set('Cookie', [`sgssu_csrf=${token}`, 'sgssu_rt=nadie'].join('; ')).set('X-CSRF-Token', token).send();
    expect(res2.status).toBe(401);
    expect(tokenRepository.revokeAllForUser).not.toHaveBeenCalled();
  });

  test('logout revoca el refresh token en la base de datos y limpia cookies', async () => {
    tokenRepository.findByHash.mockResolvedValue({ id_usuario: 1, revocado: false });
    const agent = request.agent(buildApp());
    const token = await csrf(agent);
    const res = await agent.post('/api/auth/logout').set('Cookie', [`sgssu_csrf=${token}`, 'sgssu_rt=abc'].join('; ')).set('X-CSRF-Token', token).send();
    expect(res.status).toBe(200);
    expect(tokenRepository.revokeByHash).toHaveBeenCalledTimes(1);
    expect(res.headers['set-cookie'].some((c) => /^sgssu_at=;/.test(c))).toBe(true);
    expect(auditRepository.insert).toHaveBeenCalledWith(expect.objectContaining({ operacion: 'LOGOUT' }));
  });

  test('cambio de contraseña: contraseña actual incorrecta => 422; correcta => sesiones revocadas y nueva sesión', async () => {
    const app = buildApp();
    const agent = request.agent(app);
    const token = await csrf(agent);
    const at = `sgssu_at=${signAccessToken({ userId: 1, sessionId: 7 })}`;
    const send = (body) => agent.patch('/api/auth/password').set('Cookie', [`sgssu_csrf=${token}`, at].join('; ')).set('X-CSRF-Token', token).send(body);

    const bad = await send({ password_actual: 'Incorrecta123', password_nueva: 'Nueva123456' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    expect(userRepository.updatePassword).not.toHaveBeenCalled();

    const weak = await send({ password_actual: PASSWORD, password_nueva: 'corta' });
    expect(weak.status).toBe(400);

    const ok = await send({ password_actual: PASSWORD, password_nueva: 'Nueva123456' });
    expect(ok.status).toBe(200);
    expect(userRepository.updatePassword).toHaveBeenCalledTimes(1);
    expect(userRepository.updatePassword.mock.calls[0][1]).toMatch(/^\$2[aby]\$/);
    expect(tokenRepository.revokeAllForUser).toHaveBeenCalledWith(1, { fake: true });
    expect(ok.body.data.user.debe_cambiar_password).toBe(false);
  });
});

describe('límite de intentos y base de datos caída', () => {
  test('el limitador responde 429 RATE_LIMITED con el formato uniforme', async () => {
    const app = express();
    app.use(createLimiter({ limit: 2 }));
    app.get('/x', (req, res) => res.json({ ok: true }));
    await request(app).get('/x');
    await request(app).get('/x');
    const res = await request(app).get('/x');
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });

  test('si la base de datos no responde en el login => 503 DB_UNAVAILABLE', async () => {
    userRepository.findByEmail.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    const agent = request.agent(buildApp());
    const token = await csrf(agent);
    const res = await agent.post('/api/auth/login').set('X-CSRF-Token', token).send({ correo: 'ana@uni.edu', password: PASSWORD });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DB_UNAVAILABLE');
  });

  test('csrfProtection es una función de middleware', () => {
    expect(typeof csrfProtection).toBe('function');
  });
});
