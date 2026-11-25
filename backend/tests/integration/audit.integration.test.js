'use strict';

const request = require('supertest');

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

describeDb('Consulta de auditoría (PostgreSQL real)', () => {
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
  const insertAudit = async ({ idUsuario = null, operacion, recurso, idRecurso = null, resultado = 'EXITO', detalle = null, ip = null, creado = null }) => (await query(
    `INSERT INTO auditoria (id_usuario, operacion, recurso, id_recurso, resultado, detalle, ip, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW())) RETURNING id_auditoria`,
    [idUsuario, operacion, recurso, idRecurso, resultado, detalle === null ? null : JSON.stringify(detalle), ip, creado],
  )).rows[0].id_auditoria;

  beforeAll(async () => {
    const { createApp } = require('../../src/app');
    ({ query, closePool } = require('../../src/config/database'));
    const userRepository = require('../../src/repositories/user.repository');
    const { hashPassword } = require('../../src/utils/password');
    app = createApp();
    const hash = await hashPassword(PASSWORD);
    const mk = async (rol, key) => (await userRepository.create({
      nombres: `Nombre ${key}`, apellidos: 'Auditor', correo: `${key}-${sufijo}@prueba.edu`, passwordHash: hash, rol, idDependencia: null, debeCambiarPassword: false,
    })).id_usuario;
    ids.admin = await mk('ADMINISTRADOR', 'adm');
    ids.est = await mk('ESTUDIANTE', 'est');
    ids.sup = await mk('SUPERVISOR', 'sup');
    for (const key of ['admin', 'est', 'sup']) u[key] = await login(`${key === 'admin' ? 'adm' : key}-${sufijo}@prueba.edu`);
  });

  afterAll(async () => {
    if (closePool) await closePool();
  });

  test('solo el administrador consulta (403 para los demás, 401 sin sesión)', async () => {
    expect((await request(app).get('/api/audit')).status).toBe(401);
    for (const who of [u.est, u.sup]) {
      for (const url of ['/api/audit', '/api/audit/1', '/api/audit/filters']) expect((await call(who, 'get', url)).status).toBe(403);
    }
    expect((await call(u.admin, 'get', '/api/audit')).status).toBe(200);
  });

  test('no existen endpoints para modificar o borrar la auditoría', async () => {
    const id = await insertAudit({ operacion: `PRUEBA_${sufijo}`, recurso: 'prueba' });
    for (const method of ['put', 'patch', 'delete', 'post']) {
      const res = await call(u.admin, method, `/api/audit/${id}`, method === 'delete' ? undefined : {});
      expect(res.status).toBe(404);
    }
    expect((await query('SELECT 1 FROM auditoria WHERE id_auditoria = $1', [id])).rowCount).toBe(1);
  });

  test('lista con usuario, orden descendente, paginación y filtros exactos', async () => {
    const op = `OPERACION_${sufijo}`;
    const a = await insertAudit({ idUsuario: ids.est, operacion: op, recurso: 'solicitudes', idRecurso: '77', ip: '10.0.0.5', detalle: { campo: { antes: 'a', despues: 'b' } } });
    const b = await insertAudit({ idUsuario: ids.sup, operacion: op, recurso: 'solicitudes', idRecurso: '78', resultado: 'FALLO' });
    const c = await insertAudit({ operacion: op, recurso: 'sistema' });

    const all = await call(u.admin, 'get', `/api/audit?operacion=${op}`);
    expect(all.status).toBe(200);
    expect(all.body.data.map((r) => r.id_auditoria)).toEqual([c, b, a]);
    expect(all.body.meta).toEqual(expect.objectContaining({ total: 3, page: 1 }));
    const first = all.body.data[2];
    expect(first).toEqual(expect.objectContaining({
      id_usuario: ids.est, usuario: 'Nombre est Auditor', correo: `est-${sufijo}@prueba.edu`, recurso: 'solicitudes', id_recurso: '77', resultado: 'EXITO', ip: '10.0.0.5',
      detalle: { campo: { antes: 'a', despues: 'b' } },
    }));
    expect(all.body.data[0]).toEqual(expect.objectContaining({ id_usuario: null, usuario: null, correo: null })); // evento del sistema

    expect((await call(u.admin, 'get', `/api/audit?operacion=${op}&page=2&pageSize=2`)).body.data.map((r) => r.id_auditoria)).toEqual([a]);
    expect((await call(u.admin, 'get', `/api/audit?operacion=${op}&resultado=FALLO`)).body.data.map((r) => r.id_auditoria)).toEqual([b]);
    expect((await call(u.admin, 'get', `/api/audit?operacion=${op}&recurso=sistema`)).body.data.map((r) => r.id_auditoria)).toEqual([c]);
    expect((await call(u.admin, 'get', `/api/audit?operacion=${op}&id_recurso=78`)).body.data.map((r) => r.id_auditoria)).toEqual([b]);
    expect((await call(u.admin, 'get', `/api/audit?operacion=${op}&id_usuario=${ids.est}`)).body.data.map((r) => r.id_auditoria)).toEqual([a]);
  });

  test('filtro por fechas en hora de Bogotá (hasta inclusivo)', async () => {
    const op = `FECHAS_${sufijo}`;
    // 31 dic 2025 23:30 Bogotá = 1 ene 2026 04:30 UTC → cuenta en 2025-12-31; 1 ene 00:10 Bogotá → 05:10 UTC
    const dic = await insertAudit({ operacion: op, recurso: 'x', creado: '2026-01-01T04:30:00Z' });
    const ene = await insertAudit({ operacion: op, recurso: 'x', creado: '2026-01-01T05:10:00Z' });
    const ids1 = async (q) => (await call(u.admin, 'get', `/api/audit?operacion=${op}&${q}`)).body.data.map((r) => r.id_auditoria);
    expect(await ids1('desde=2025-12-31&hasta=2025-12-31')).toEqual([dic]);
    expect(await ids1('desde=2026-01-01&hasta=2026-01-01')).toEqual([ene]);
    expect(await ids1('desde=2025-12-31&hasta=2026-01-01')).toEqual([ene, dic]);
    expect(await ids1('desde=2026-01-02')).toEqual([]);
    expect(await ids1('hasta=2025-12-30')).toEqual([]);
  });

  test('filtros inválidos → 400', async () => {
    for (const q of ['resultado=OK', 'desde=ayer', 'desde=2026-03-01&hasta=2026-02-01', 'id_usuario=x', 'pageSize=500', 'orden=asc']) {
      expect((await call(u.admin, 'get', `/api/audit?${q}`)).status).toBe(400);
    }
  });

  test('detalle de un registro y 404 si no existe', async () => {
    const id = await insertAudit({ idUsuario: ids.admin, operacion: `DETALLE_${sufijo}`, recurso: 'usuarios', idRecurso: '5' });
    const res = await call(u.admin, 'get', `/api/audit/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({ id_auditoria: id, usuario: 'Nombre adm Auditor', operacion: `DETALLE_${sufijo}` }));
    expect((await call(u.admin, 'get', '/api/audit/999999999')).status).toBe(404);
    expect((await call(u.admin, 'get', '/api/audit/abc')).status).toBe(400);
  });

  test('si por error hubiera credenciales en el detalle, la consulta las enmascara', async () => {
    const id = await insertAudit({ operacion: `SECRETO_${sufijo}`, recurso: 'x', detalle: { password: 'Pwd123456789', anidado: { refresh_token: 'abc' }, correo: 'a@b.c' } });
    const list = await call(u.admin, 'get', `/api/audit?operacion=SECRETO_${sufijo}`);
    expect(list.body.data[0].detalle).toEqual({ password: '[oculto]', anidado: { refresh_token: '[oculto]' }, correo: 'a@b.c' });
    expect(JSON.stringify((await call(u.admin, 'get', `/api/audit/${id}`)).body)).not.toContain('Pwd123456789');
  });

  test('filtros: operaciones y recursos existentes, ordenados y sin repetir', async () => {
    await insertAudit({ operacion: `ZZ_${sufijo}`, recurso: `rec_${sufijo}` });
    await insertAudit({ operacion: `ZZ_${sufijo}`, recurso: `rec_${sufijo}` });
    const res = await call(u.admin, 'get', '/api/audit/filters');
    expect(res.status).toBe(200);
    const { operaciones, recursos } = res.body.data;
    expect(operaciones.filter((o) => o === `ZZ_${sufijo}`)).toHaveLength(1);
    expect(recursos.filter((r) => r === `rec_${sufijo}`)).toHaveLength(1);
    expect([...operaciones].sort()).toEqual(operaciones);
  });

  test('las operaciones reales dejan rastro consultable (login y alta de usuario)', async () => {
    await call(u.admin, 'post', '/api/dependencies', { nombre: `Dep Audit ${sufijo}` });
    const res = await call(u.admin, 'get', '/api/audit?operacion=DEPENDENCIA_CREAR&pageSize=100');
    expect(res.body.data.some((r) => r.usuario === 'Nombre adm Auditor' && r.recurso === 'dependencias')).toBe(true);
    const logins = await call(u.admin, 'get', `/api/audit?operacion=LOGIN&id_usuario=${ids.est}`);
    expect(logins.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
