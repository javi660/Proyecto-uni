'use strict';

const request = require('supertest');

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

describeDb('API de notificaciones con PostgreSQL real', () => {
  const PASSWORD = 'Valida12345';
  const sufijo = Date.now().toString(36);
  let app;
  let query;
  let closePool;
  const u = {};
  const ids = {};

  async function login(correo) {
    const agent = request.agent(app);
    const csrf = (await agent.get('/api/auth/csrf')).body.data.csrf_token;
    const res = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ correo, password: PASSWORD });
    expect(res.status).toBe(200);
    return { agent, csrf };
  }
  const call = (who, method, url, body) => {
    let req = who.agent[method](url);
    if (method !== 'get') req = req.set('X-CSRF-Token', who.csrf);
    return body === undefined ? req : req.send(body);
  };
  const insertNotif = async (idUsuario, idSolicitud, titulo, leida = false) => (await query(
    `INSERT INTO notificaciones (id_usuario, id_solicitud, titulo, mensaje, tipo, leida) VALUES ($1, $2, $3, 'Mensaje', 'SOLICITUD_INICIADA', $4) RETURNING id_notificacion`,
    [idUsuario, idSolicitud, titulo, leida],
  )).rows[0].id_notificacion;

  beforeAll(async () => {
    const { createApp } = require('../../src/app');
    ({ query, closePool } = require('../../src/config/database'));
    const userRepository = require('../../src/repositories/user.repository');
    const { hashPassword } = require('../../src/utils/password');
    app = createApp();
    const hash = await hashPassword(PASSWORD);
    const mk = async (rol, key, idDependencia = null) => (await userRepository.create({
      nombres: key, apellidos: 'Prueba', correo: `${key}-${sufijo}@prueba.edu`, passwordHash: hash, rol, idDependencia, debeCambiarPassword: false,
    })).id_usuario;
    ids.admin = await mk('ADMINISTRADOR', 'adm');
    u.admin = await login(`adm-${sufijo}@prueba.edu`);
    const dep = await call(u.admin, 'post', '/api/dependencies', { nombre: `Dep Not ${sufijo}` });
    ids.dep = dep.body.data.id_dependencia;
    const cat = await call(u.admin, 'post', '/api/categories', { nombre: `Cat Not ${sufijo}` });
    const sv = await call(u.admin, 'post', '/api/services', { nombre: `Sv Not ${sufijo}`, id_categoria: cat.body.data.id_categoria, id_dependencia: ids.dep });
    ids.servicio = sv.body.data.id_servicio;
    ids.est = await mk('ESTUDIANTE', 'est');
    ids.est2 = await mk('ESTUDIANTE', 'est2');
    ids.func = await mk('FUNCIONARIO', 'func', ids.dep);
    for (const key of ['est', 'est2', 'func']) u[key] = await login(`${key}-${sufijo}@prueba.edu`);
  });

  afterAll(async () => {
    if (closePool) await closePool();
  });

  test('exige sesión', async () => {
    expect((await request(app).get('/api/notifications')).status).toBe(401);
    expect((await request(app).get('/api/notifications/unread-count')).status).toBe(401);
  });

  test('flujo real: las notificaciones del ciclo llegan al usuario correcto y se marcan leídas', async () => {
    const created = await call(u.est, 'post', '/api/requests', { id_servicio: ids.servicio, asunto: 'Asunto', descripcion: 'Desc' });
    const id = created.body.data.id_solicitud;
    await call(u.admin, 'post', `/api/requests/${id}/assignment`, { id_funcionario: ids.func });
    await call(u.func, 'patch', `/api/requests/${id}/status`, { estado: 'EN_PROCESO' });

    const before = await call(u.est, 'get', '/api/notifications/unread-count');
    expect(before.status).toBe(200);
    const unread = before.body.data.no_leidas;
    expect(unread).toBeGreaterThanOrEqual(1);

    const list = await call(u.est, 'get', '/api/notifications?pageSize=100');
    expect(list.status).toBe(200);
    const mine = list.body.data.filter((n) => n.id_solicitud === id);
    expect(mine.map((n) => n.tipo)).toContain('SOLICITUD_INICIADA');
    expect(mine[0]).toEqual(expect.objectContaining({ codigo: created.body.data.codigo, leida: false, titulo: expect.any(String) }));
    expect(list.body.meta.total).toBe(list.body.data.length);

    const read = await call(u.est, 'patch', `/api/notifications/${mine[0].id_notificacion}/read`);
    expect(read.status).toBe(200);
    expect(read.body.data.leida).toBe(true);
    expect((await call(u.est, 'get', '/api/notifications/unread-count')).body.data.no_leidas).toBe(unread - 1);
    // idempotente
    expect((await call(u.est, 'patch', `/api/notifications/${mine[0].id_notificacion}/read`)).status).toBe(200);
    expect((await call(u.est, 'get', '/api/notifications/unread-count')).body.data.no_leidas).toBe(unread - 1);
  });

  test('orden descendente, paginación y filtro por leída', async () => {
    const n1 = await insertNotif(ids.est2, null, 'Primera');
    const n2 = await insertNotif(ids.est2, null, 'Segunda', true);
    const n3 = await insertNotif(ids.est2, null, 'Tercera');
    const all = await call(u.est2, 'get', '/api/notifications');
    expect(all.body.data.map((n) => n.id_notificacion)).toEqual([n3, n2, n1]);
    expect(all.body.data[0].codigo).toBeNull(); // sin solicitud asociada

    const page = await call(u.est2, 'get', '/api/notifications?page=2&pageSize=2');
    expect(page.body.data.map((n) => n.id_notificacion)).toEqual([n1]);
    expect(page.body.meta.total).toBe(3);

    const unreadOnly = await call(u.est2, 'get', '/api/notifications?leida=false');
    expect(unreadOnly.body.data.map((n) => n.id_notificacion)).toEqual([n3, n1]);
    const readOnly = await call(u.est2, 'get', '/api/notifications?leida=true');
    expect(readOnly.body.data.map((n) => n.id_notificacion)).toEqual([n2]);
    expect((await call(u.est2, 'get', '/api/notifications?leida=quizas')).status).toBe(400);
  });

  test('aislamiento: nadie lee ni marca las notificaciones de otro (404) y los conteos son propios', async () => {
    const mineId = await insertNotif(ids.func, null, 'Solo del funcionario');
    const res = await call(u.est, 'patch', `/api/notifications/${mineId}/read`);
    expect(res.status).toBe(404);
    expect((await query('SELECT leida FROM notificaciones WHERE id_notificacion = $1', [mineId])).rows[0].leida).toBe(false);
    const list = await call(u.est, 'get', '/api/notifications?pageSize=100');
    expect(list.body.data.map((n) => n.id_notificacion)).not.toContain(mineId);
    expect((await call(u.admin, 'get', '/api/notifications/unread-count')).body.data.no_leidas).toBe(0);
    expect((await call(u.est, 'patch', '/api/notifications/999999999/read')).status).toBe(404);
    expect((await call(u.est, 'patch', '/api/notifications/abc/read')).status).toBe(400);
  });

  test('marcar todas como leídas solo afecta a quien lo pide', async () => {
    await insertNotif(ids.est2, null, 'A');
    await insertNotif(ids.est2, null, 'B');
    const otherBefore = (await call(u.func, 'get', '/api/notifications/unread-count')).body.data.no_leidas;
    const res = await call(u.est2, 'patch', '/api/notifications/read-all');
    expect(res.status).toBe(200);
    expect(res.body.data.actualizadas).toBeGreaterThanOrEqual(2);
    expect((await call(u.est2, 'get', '/api/notifications/unread-count')).body.data.no_leidas).toBe(0);
    expect((await call(u.func, 'get', '/api/notifications/unread-count')).body.data.no_leidas).toBe(otherBefore);
    expect((await call(u.est2, 'patch', '/api/notifications/read-all')).body.data.actualizadas).toBe(0);
  });

  test('las mutaciones exigen CSRF', async () => {
    const res = await u.est.agent.patch('/api/notifications/read-all');
    expect(res.status).toBe(403);
  });
});
