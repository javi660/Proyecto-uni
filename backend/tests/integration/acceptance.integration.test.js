'use strict';

/**
 * Pruebas de aceptación CP01–CP20 (Fase 12). Ejecutan flujos completos contra la API real y PostgreSQL real.
 * Cada caso registra lo observado (resultado obtenido) y su estado en docs/evidencias/resultados-aceptacion.json.
 * Las definiciones (objetivo, precondiciones, procedimiento, esperado) están en tests/acceptance/casos.js.
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { CASOS } = require('../acceptance/casos');

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(60, 2)]);
/** Describe la base usada según TEST_DATABASE_URL, sin guardar credenciales. */
function dbLabel() {
  try {
    const { hostname } = new URL(process.env.TEST_DATABASE_URL);
    return ['localhost', '127.0.0.1', '::1'].includes(hostname)
      ? 'PostgreSQL local de pruebas (no Supabase)'
      : `PostgreSQL remoto de pruebas (host ${hostname})`;
  } catch (err) {
    return 'PostgreSQL de pruebas (host no determinado)';
  }
}
const RESULTS_FILE = path.resolve(__dirname, '../../../docs/evidencias/resultados-aceptacion.json');

describeDb('Aceptación CP01–CP20 (PostgreSQL real)', () => {
  const PASSWORD = 'Valida12345';
  const sufijo = Date.now().toString(36);
  const results = {};
  let app;
  let query;
  let closePool;
  let storage;
  const u = {};
  const ids = {};

  const csrfOf = async (agent) => (await agent.get('/api/auth/csrf')).body.data.csrf_token;
  async function login(correo, password = PASSWORD) {
    const agent = request.agent(app);
    const csrf = await csrfOf(agent);
    const res = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ correo, password });
    return { agent, csrf, res };
  }
  const session = async (correo) => {
    const s = await login(correo);
    expect(s.res.status).toBe(200);
    return s;
  };
  const call = (who, method, url, body) => {
    let req = who.agent[method](url);
    if (method !== 'get') req = req.set('X-CSRF-Token', who.csrf);
    return body === undefined ? req : req.send(body);
  };
  const upload = (who, id, buffer, filename, contentType) => who.agent.post(`/api/requests/${id}/attachments`).set('X-CSRF-Token', who.csrf).attach('archivo', buffer, { filename, contentType });
  const mail = (key) => `${key.toLowerCase()}-${sufijo}@prueba.edu`;

  const status = (who, id, estado, observacion) => call(who, 'patch', `/api/requests/${id}/status`, observacion === undefined ? { estado } : { estado, observacion });
  const respond = (who, id, contenido, visibilidad) => call(who, 'post', `/api/requests/${id}/responses`, visibilidad ? { contenido, visibilidad } : { contenido });
  const assign = (who, id, idFuncionario) => call(who, 'post', `/api/requests/${id}/assignment`, { id_funcionario: idFuncionario });
  const row = async (id) => (await query('SELECT * FROM solicitudes WHERE id_solicitud = $1', [id])).rows[0];
  const notifs = async (id, tipo) => (await query('SELECT id_usuario FROM notificaciones WHERE id_solicitud = $1 AND tipo = $2 ORDER BY id_usuario', [id, tipo])).rows.map((r) => r.id_usuario);

  const create = async (over = {}) => {
    const res = await call(u.est1, 'post', '/api/requests', { id_servicio: ids.servicio, asunto: `Asunto ${Math.random().toString(36).slice(2)}`, descripcion: 'Descripción de la solicitud', ...over });
    expect(res.status).toBe(201);
    return res.body.data;
  };
  const toAssigned = async () => { const r = await create(); expect((await assign(u.sup, r.id_solicitud, ids.func)).status).toBe(200); return r.id_solicitud; };
  const toInProcess = async () => { const id = await toAssigned(); expect((await status(u.func, id, 'EN_PROCESO')).status).toBe(200); return id; };
  const toResolved = async () => {
    const id = await toInProcess();
    expect((await respond(u.func, id, 'Solución aplicada')).status).toBe(201);
    expect((await status(u.func, id, 'RESUELTA', 'Listo')).status).toBe(200);
    return id;
  };

  /** Ejecuta un caso: registra lo observado y su estado; si algo falla queda FALLIDO y se relanza el error. */
  const caso = (id, fn) => test(`${id} ${CASOS.find((c) => c.id === id).titulo}`, async () => {
    const obtenido = [];
    const evidencia = [];
    const obs = (t) => obtenido.push(t);
    const ev = (t) => evidencia.push(t);
    const inicio = Date.now();
    try {
      await fn(obs, ev);
      results[id] = { estado: 'APROBADO', obtenido, evidencia, ms: Date.now() - inicio };
    } catch (err) {
      results[id] = { estado: 'FALLIDO', obtenido, evidencia, error: String(err.message || err).split('\n')[0].slice(0, 300), ms: Date.now() - inicio };
      throw err;
    }
  });

  beforeAll(async () => {
    const { createApp } = require('../../src/app');
    ({ query, closePool } = require('../../src/config/database'));
    storage = require('../../src/services/storage.service');
    storage.setDriverForTests(storage.createMemoryDriver());
    const userRepository = require('../../src/repositories/user.repository');
    const { hashPassword } = require('../../src/utils/password');
    app = createApp();
    const hash = await hashPassword(PASSWORD);
    const mk = async (rol, key, idDependencia = null) => (await userRepository.create({
      nombres: key, apellidos: 'Aceptación', correo: mail(key), passwordHash: hash, rol, idDependencia, debeCambiarPassword: false,
    })).id_usuario;

    ids.admin = await mk('ADMINISTRADOR', 'admin');
    u.admin = await session(mail('admin'));
    const dep = await call(u.admin, 'post', '/api/dependencies', { nombre: `Registro Académico ${sufijo}` });
    const dep2 = await call(u.admin, 'post', '/api/dependencies', { nombre: `Bienestar ${sufijo}` });
    ids.dep = dep.body.data.id_dependencia;
    ids.dep2 = dep2.body.data.id_dependencia;
    const cat = await call(u.admin, 'post', '/api/categories', { nombre: `Certificados ${sufijo}` });
    const sv = await call(u.admin, 'post', '/api/services', { nombre: `Certificado de notas ${sufijo}`, id_categoria: cat.body.data.id_categoria, id_dependencia: ids.dep });
    ids.cat = cat.body.data.id_categoria;
    ids.servicio = sv.body.data.id_servicio;
    ids.est1 = await mk('ESTUDIANTE', 'est1');
    ids.est2 = await mk('ESTUDIANTE', 'est2');
    ids.func = await mk('FUNCIONARIO', 'func', ids.dep);
    ids.func2 = await mk('FUNCIONARIO', 'func2', ids.dep);
    ids.funcOtra = await mk('FUNCIONARIO', 'funcotra', ids.dep2);
    ids.sup = await mk('SUPERVISOR', 'sup');
    ids.supOtro = await mk('SUPERVISOR', 'supotro');
    await query('INSERT INTO supervision_dependencia (id_supervisor, id_dependencia) VALUES ($1, $2)', [ids.sup, ids.dep]);
    await query('INSERT INTO supervision_dependencia (id_supervisor, id_dependencia) VALUES ($1, $2)', [ids.supOtro, ids.dep2]);
    for (const key of ['est1', 'est2', 'func', 'func2', 'funcOtra', 'sup', 'supOtro']) u[key] = await session(mail(key));
  });

  afterAll(async () => {
    const { rows } = await query('SHOW server_version');
    const fecha = new Date().toISOString();
    fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
    fs.writeFileSync(RESULTS_FILE, JSON.stringify({
      ejecutado_en: fecha,
      entorno: { node: process.version, postgresql: rows[0].server_version, base_de_datos: dbLabel(), almacenamiento_adjuntos: 'controlador en memoria (no Supabase Storage)' },
      resultados: results,
    }, null, 2));
    await closePool();
  });

  caso('CP01', async (obs, ev) => {
    for (const key of ['admin', 'est1', 'func', 'sup']) {
      const s = await login(mail(key));
      expect(s.res.status).toBe(200);
      const cookies = s.res.headers['set-cookie'];
      for (const name of ['sgssu_at', 'sgssu_rt']) {
        const c = cookies.find((x) => x.startsWith(`${name}=`));
        expect(c).toMatch(/HttpOnly/i);
      }
      expect(JSON.stringify(s.res.body)).not.toMatch(/eyJ/);
      const me = await s.agent.get('/api/auth/me');
      expect(me.status).toBe(200);
      expect(me.body.data.user.rol).toBe(s.res.body.data.user.rol);
      obs(`${s.res.body.data.user.rol}: login 200, cookies HttpOnly, sin JWT en el cuerpo, /me 200`);
    }
    const s = await session(mail('est2'));
    expect((await call(s, 'post', '/api/auth/logout')).status).toBe(200);
    const after = await s.agent.get('/api/auth/me');
    expect(after.status).toBe(401);
    obs(`Tras logout, GET /api/auth/me → ${after.status}`);
    ev('Respuestas HTTP de login, /me y logout de los 4 perfiles');
  });

  caso('CP02', async (obs, ev) => {
    const before = Number((await query("SELECT count(*) FROM auditoria WHERE resultado = 'FALLO'")).rows[0].count);
    const wrong = await login(mail('est2'), 'Incorrecta123');
    const unknown = await login(`nadie-${sufijo}@prueba.edu`, 'Incorrecta123');
    expect(wrong.res.status).toBe(401);
    expect(unknown.res.status).toBe(401);
    expect(wrong.res.body.error.message).toBe(unknown.res.body.error.message);
    obs(`Contraseña incorrecta → ${wrong.res.status}; correo inexistente → ${unknown.res.status}; mismo mensaje: "${wrong.res.body.error.message}"`);
    const mk = await call(u.admin, 'post', '/api/users', { nombres: 'Baja', apellidos: 'Prueba', correo: `baja-${sufijo}@prueba.edu`, rol: 'ESTUDIANTE', password_inicial: PASSWORD });
    expect(mk.status).toBe(201);
    const off = await call(u.admin, 'patch', `/api/users/${mk.body.data.id_usuario}/status`, { activo: false });
    expect(off.status).toBe(200);
    const inactive = await login(`baja-${sufijo}@prueba.edu`);
    expect(inactive.res.status).toBe(403);
    obs(`Cuenta desactivada → ${inactive.res.status}: "${inactive.res.body.error.message}"`);
    const after = await query("SELECT resultado FROM auditoria WHERE operacion ILIKE '%LOGIN%' OR operacion ILIKE '%ACCESO%' OR operacion ILIKE '%SESION%'");
    const fallos = Number((await query("SELECT count(*) FROM auditoria WHERE resultado = 'FALLO'")).rows[0].count);
    expect(fallos).toBeGreaterThanOrEqual(before + 2);
    expect(after.rows.map((r) => r.resultado)).toEqual(expect.arrayContaining(['EXITO', 'FALLO']));
    obs(`Auditoría: ${fallos - before} fallos nuevos registrados y registros EXITO presentes`);
    ev('Filas de la tabla auditoria con resultado FALLO/EXITO');
  });

  caso('CP03', async (obs) => {
    const checks = [
      ['sin sesión GET /api/requests', await request(app).get('/api/requests'), 401],
      ['estudiante GET /api/users', await call(u.est1, 'get', '/api/users'), 403],
      ['funcionario GET /api/users', await call(u.func, 'get', '/api/users'), 403],
      ['funcionario POST /api/dependencies', await call(u.func, 'post', '/api/dependencies', { nombre: 'X' }), 403],
      ['estudiante GET /api/audit', await call(u.est1, 'get', '/api/audit'), 403],
      ['administrador GET /api/users', await call(u.admin, 'get', '/api/users'), 200],
    ];
    for (const [nombre, res, esperado] of checks) {
      expect(res.status).toBe(esperado);
      obs(`${nombre} → ${res.status}`);
    }
  });

  caso('CP04', async (obs) => {
    const correo = `nuevo-${sufijo}@prueba.edu`;
    const created = await call(u.admin, 'post', '/api/users', { nombres: 'Nuevo', apellidos: 'Estudiante', correo, rol: 'ESTUDIANTE', password_inicial: PASSWORD });
    expect(created.status).toBe(201);
    expect(JSON.stringify(created.body)).not.toMatch(/password_hash|password_inicial|\$2[aby]\$/i);
    obs(`Alta → ${created.status}; la respuesta no incluye contraseña ni hash`);
    const s = await login(correo);
    expect(s.res.status).toBe(200);
    expect(s.res.body.data.user.debe_cambiar_password).toBe(true);
    const blocked = await call(s, 'get', '/api/requests/my');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    obs(`Antes de cambiar la contraseña: ${blocked.status} ${blocked.body.error.code}`);
    const changed = await call(s, 'patch', '/api/auth/password', { password_actual: PASSWORD, password_nueva: 'Nueva123456' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.user.debe_cambiar_password).toBe(false);
    const ok = await call(s, 'get', '/api/requests/my');
    expect(ok.status).toBe(200);
    obs(`Cambio de contraseña → ${changed.status}; después GET /api/requests/my → ${ok.status}`);
  });

  caso('CP05', async (obs) => {
    const dep = await call(u.admin, 'post', '/api/dependencies', { nombre: `Tesorería ${sufijo}` });
    expect(dep.status).toBe(201);
    const dup = await call(u.admin, 'post', '/api/dependencies', { nombre: `Tesorería ${sufijo}` });
    expect(dup.status).toBe(409);
    obs(`Dependencia creada ${dep.status}; duplicada ${dup.status}`);
    const cat = await call(u.admin, 'post', '/api/categories', { nombre: `Pagos ${sufijo}` });
    const sv = await call(u.admin, 'post', '/api/services', { nombre: `Paz y salvo ${sufijo}`, id_categoria: cat.body.data.id_categoria, id_dependencia: dep.body.data.id_dependencia });
    expect(cat.status).toBe(201);
    expect(sv.status).toBe(201);
    obs(`Categoría ${cat.status}; servicio ${sv.status}`);
    expect((await call(u.admin, 'patch', `/api/services/${sv.body.data.id_servicio}/status`, { activo: false })).status).toBe(200);
    const blocked = await call(u.est1, 'post', '/api/requests', { id_servicio: sv.body.data.id_servicio, asunto: 'Paz y salvo', descripcion: 'Necesito el documento' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('SERVICE_INACTIVE');
    obs(`Solicitud sobre servicio desactivado → ${blocked.status} ${blocked.body.error.code}`);
  });

  caso('CP06', async (obs, ev) => {
    const r = await create();
    const db = await row(r.id_solicitud);
    expect(db.estado).toBe('REGISTRADA');
    expect(db.id_estudiante).toBe(ids.est1);
    expect(r.codigo).toBeTruthy();
    obs(`Creada ${r.codigo}: estado ${db.estado}, propietario = estudiante autenticado`);
    const dest = await notifs(r.id_solicitud, 'SOLICITUD_REGISTRADA');
    expect(dest).toEqual(expect.arrayContaining([ids.est1, ids.sup]));
    obs(`Notificaciones SOLICITUD_REGISTRADA a ${dest.length} destinatarios (estudiante y supervisor incluidos)`);
    const forged = await call(u.est1, 'post', '/api/requests', { id_servicio: ids.servicio, asunto: 'Manipulada', descripcion: 'Intento', estado: 'CERRADA', id_estudiante: ids.est2 });
    if (forged.status === 201) {
      const f = await row(forged.body.data.id_solicitud);
      expect(f.estado).toBe('REGISTRADA');
      expect(f.id_estudiante).toBe(ids.est1);
      obs('Campos manipulados ignorados: estado REGISTRADA y propietario real');
    } else {
      expect(forged.status).toBe(400);
      obs(`Campos manipulados rechazados con ${forged.status}`);
    }
    ev(`Solicitud ${r.codigo} y filas de notificaciones`);
  });

  caso('CP07', async (obs) => {
    const casos = [
      ['asunto vacío', { id_servicio: ids.servicio, asunto: '', descripcion: 'x' }, 400],
      ['descripción vacía', { id_servicio: ids.servicio, asunto: 'x', descripcion: '' }, 400],
      ['servicio no numérico', { id_servicio: 'abc', asunto: 'x', descripcion: 'x' }, 400],
      ['servicio inexistente', { id_servicio: 999999999, asunto: 'x', descripcion: 'x' }, 404],
    ];
    const antes = Number((await query('SELECT count(*) FROM solicitudes WHERE id_estudiante = $1', [ids.est1])).rows[0].count);
    for (const [nombre, body, esperado] of casos) {
      const res = await call(u.est1, 'post', '/api/requests', body);
      expect(res.status).toBe(esperado);
      obs(`${nombre} → ${res.status}${res.body.error?.code ? ` ${res.body.error.code}` : ''}`);
    }
    const despues = Number((await query('SELECT count(*) FROM solicitudes WHERE id_estudiante = $1', [ids.est1])).rows[0].count);
    expect(despues).toBe(antes);
    obs('Ninguna solicitud creada con datos inválidos');
  });

  caso('CP08', async (obs) => {
    const r = await create();
    const id = r.id_solicitud;
    const up = await upload(u.est1, id, PDF, 'Acta de notas.pdf', 'application/pdf');
    expect(up.status).toBe(201);
    const down = await u.est1.agent.get(`/api/attachments/${up.body.data.id_adjunto}/download`).buffer(true).parse((res, cb) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(down.status).toBe(200);
    expect(Buffer.compare(down.body, PDF)).toBe(0);
    expect(down.headers['content-disposition']).toMatch(/^attachment/);
    expect(down.headers['x-content-type-options']).toBe('nosniff');
    obs(`PDF subido ${up.status}; descarga ${down.status} idéntica, attachment + nosniff`);
    const exe = await upload(u.est1, id, EXE, 'virus.exe', 'application/octet-stream');
    expect(exe.status).toBe(415);
    const fake = await upload(u.est1, id, PNG, 'foto.pdf', 'application/pdf');
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('FILE_CONTENT_MISMATCH');
    obs(`Ejecutable → ${exe.status}; PNG con extensión PDF → ${fake.status} ${fake.body.error.code}`);
    expect((await upload(u.est1, id, PNG, 'a.png', 'image/png')).status).toBe(201);
    expect((await upload(u.est1, id, PNG, 'b.png', 'image/png')).status).toBe(201);
    const fourth = await upload(u.est1, id, PNG, 'c.png', 'image/png');
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.code).toBe('ATTACHMENT_LIMIT');
    obs(`Cuarto adjunto → ${fourth.status} ${fourth.body.error.code}`);
  });

  caso('CP09', async (obs) => {
    const r = await create();
    const id = r.id_solicitud;
    for (const [nombre, who] of [['estudiante 2', u.est2], ['supervisor de otra dependencia', u.supOtro], ['funcionario no asignado', u.func]]) {
      const res = await call(who, 'get', `/api/requests/${id}`);
      expect(res.status).toBe(404);
      obs(`${nombre} → ${res.status}`);
    }
    const mine2 = await call(u.est2, 'get', '/api/requests/my');
    expect(JSON.stringify(mine2.body.data)).not.toContain(r.codigo);
    obs('El listado del estudiante 2 no contiene la solicitud ajena');
    for (const [nombre, who] of [['propietario', u.est1], ['supervisor del ámbito', u.sup], ['administrador', u.admin]]) {
      const res = await call(who, 'get', `/api/requests/${id}`);
      expect(res.status).toBe(200);
      obs(`${nombre} → ${res.status}`);
    }
  });

  caso('CP10', async (obs) => {
    const r = await create();
    const id = r.id_solicitud;
    expect((await assign(u.est1, id, ids.func)).status).toBe(403);
    expect((await assign(u.func, id, ids.func)).status).toBe(403);
    obs('Estudiante y funcionario intentan asignar → 403');
    const ajeno = await assign(u.supOtro, id, ids.func);
    expect(ajeno.status).toBe(404);
    obs(`Supervisor de otra dependencia → ${ajeno.status}`);
    const incompetente = await assign(u.sup, id, ids.funcOtra);
    expect(incompetente.status).toBeGreaterThanOrEqual(400);
    expect(incompetente.status).toBeLessThan(500);
    expect((await row(id)).estado).toBe('REGISTRADA');
    obs(`Funcionario de otra dependencia → ${incompetente.status} ${incompetente.body.error?.code || ''}; la solicitud sigue REGISTRADA`);
    const ok = await assign(u.sup, id, ids.func);
    expect(ok.status).toBe(200);
    expect((await row(id)).estado).toBe('ASIGNADA');
    expect(await notifs(id, 'SOLICITUD_ASIGNADA')).toEqual(expect.arrayContaining([ids.est1, ids.func]));
    expect(await notifs(id, 'SOLICITUD_ASIGNADA')).not.toContain(ids.sup);
    obs(`Asignación del supervisor → ${ok.status}: ASIGNADA; notificados estudiante y funcionario, no el actor`);
    const prio = await call(u.sup, 'patch', `/api/requests/${id}/priority`, { prioridad: 'ALTA' });
    expect(prio.status).toBe(200);
    expect((await row(id)).prioridad).toBe('ALTA');
    const prioEst = await call(u.est1, 'patch', `/api/requests/${id}/priority`, { prioridad: 'BAJA' });
    expect(prioEst.status).toBe(403);
    obs(`Prioridad ALTA por el supervisor → ${prio.status}; por el estudiante → ${prioEst.status}`);
  });

  caso('CP11', async (obs) => {
    const id = await toAssigned();
    const otro = await status(u.func2, id, 'EN_PROCESO');
    expect(otro.status).toBe(404);
    const est = await status(u.est1, id, 'EN_PROCESO');
    expect(est.status).toBe(403);
    obs(`Funcionario no asignado → ${otro.status}; estudiante → ${est.status}`);
    const ok = await status(u.func, id, 'EN_PROCESO');
    expect(ok.status).toBe(200);
    expect((await row(id)).estado).toBe('EN_PROCESO');
    const dest = await notifs(id, 'SOLICITUD_INICIADA');
    expect(dest).toEqual([ids.est1]);
    obs(`Funcionario asignado → ${ok.status}: EN_PROCESO; SOLICITUD_INICIADA solo al estudiante (el actor no se notifica)`);
  });

  caso('CP12', async (obs) => {
    const id = await toInProcess();
    const interna = await respond(u.func, id, 'Nota interna de gestión', 'INTERNA');
    const publica = await respond(u.func, id, 'Estamos revisando su caso', 'PUBLICA');
    expect(interna.status).toBe(201);
    expect(publica.status).toBe(201);
    const vistaEst = await call(u.est1, 'get', `/api/requests/${id}/responses`);
    const vistaFunc = await call(u.func, 'get', `/api/requests/${id}/responses`);
    expect(vistaEst.body.data.map((x) => x.contenido)).toEqual(['Estamos revisando su caso']);
    expect(vistaFunc.body.data).toHaveLength(2);
    obs(`El estudiante ve ${vistaEst.body.data.length} respuesta (la pública); el funcionario ve ${vistaFunc.body.data.length}`);
    const est = await respond(u.est1, id, 'Quiero responder');
    expect(est.status).toBe(403);
    obs(`Estudiante intenta responder → ${est.status}`);
    expect(await notifs(id, 'NUEVA_RESPUESTA')).toEqual([ids.est1]);
    expect((await query("SELECT 1 FROM notificaciones WHERE id_solicitud = $1 AND tipo = 'NUEVA_RESPUESTA'", [id])).rowCount).toBe(1);
    obs('Una sola notificación NUEVA_RESPUESTA (la pública)');
  });

  caso('CP13', async (obs) => {
    const id = await toInProcess();
    const sin = await status(u.func, id, 'RESUELTA', 'Listo');
    expect(sin.status).toBe(409);
    expect(sin.body.error.code).toBe('RESPONSE_REQUIRED');
    obs(`Sin respuestas → ${sin.status} ${sin.body.error.code}`);
    await respond(u.func, id, 'Solo interna', 'INTERNA');
    const interna = await status(u.func, id, 'RESUELTA', 'Listo');
    expect(interna.status).toBe(409);
    obs(`Solo con respuesta interna → ${interna.status} ${interna.body.error.code}`);
    expect((await respond(u.func, id, 'Su certificado fue generado')).status).toBe(201);
    const ok = await status(u.func, id, 'RESUELTA', 'Listo');
    expect(ok.status).toBe(200);
    const db = await row(id);
    expect(db.estado).toBe('RESUELTA');
    expect(db.fecha_resolucion).not.toBeNull();
    expect(await notifs(id, 'SOLICITUD_RESUELTA')).toEqual([ids.est1]);
    obs(`Con respuesta pública → ${ok.status}: RESUELTA con fecha_resolucion; notificado el estudiante`);
  });

  caso('CP14', async (obs) => {
    const id = await toResolved();
    const ajeno = await status(u.est2, id, 'CERRADA');
    expect(ajeno.status).toBe(404);
    obs(`Otro estudiante intenta cerrar → ${ajeno.status}`);
    const ok = await status(u.est1, id, 'CERRADA');
    expect(ok.status).toBe(200);
    expect((await row(id)).estado).toBe('CERRADA');
    const asg = (await query('SELECT activo, finalizado_en FROM asignaciones WHERE id_solicitud = $1', [id])).rows;
    expect(asg.every((a) => a.activo === false && a.finalizado_en)).toBe(true);
    obs(`El propietario cierra → ${ok.status}: CERRADA; ${asg.length} asignación(es) inactiva(s) con fecha de fin`);
    const t = await status(u.func, id, 'EN_PROCESO');
    const r = await respond(u.func, id, 'Tarde');
    const a = await assign(u.sup, id, ids.func2);
    for (const res of [t, r, a]) expect(res.status).toBe(409);
    obs(`Transición ${t.status}, respuesta ${r.status} y reasignación ${a.status} sobre CERRADA (todas 409)`);
  });

  caso('CP15', async (obs) => {
    const id = await toResolved();
    const sin = await status(u.est1, id, 'REABIERTA');
    expect(sin.status).toBe(400);
    const ajeno = await status(u.est2, id, 'REABIERTA', 'No es mía');
    expect(ajeno.status).toBe(404);
    obs(`Sin motivo → ${sin.status}; estudiante ajeno → ${ajeno.status}`);
    const ok = await status(u.est1, id, 'REABIERTA', 'El certificado tiene un error en el nombre');
    expect(ok.status).toBe(200);
    expect((await row(id)).estado).toBe('REABIERTA');
    expect(await notifs(id, 'SOLICITUD_REABIERTA')).toEqual(expect.arrayContaining([ids.func, ids.sup]));
    obs(`Con motivo → ${ok.status}: REABIERTA; notificados funcionario y supervisor`);
    const back = await status(u.func, id, 'EN_PROCESO');
    expect(back.status).toBe(200);
    obs(`El funcionario retoma → ${back.status}: EN_PROCESO`);
  });

  caso('CP16', async (obs) => {
    const r = await create();
    const id = r.id_solicitud;
    const sin = await status(u.sup, id, 'RECHAZADA');
    expect(sin.status).toBe(400);
    const func = await status(u.func, id, 'RECHAZADA', 'Motivo');
    expect([403, 404]).toContain(func.status);
    obs(`Sin motivo → ${sin.status}; funcionario → ${func.status}`);
    const ok = await status(u.sup, id, 'RECHAZADA', 'No corresponde a esta dependencia');
    expect(ok.status).toBe(200);
    expect((await row(id)).estado).toBe('RECHAZADA');
    expect(await notifs(id, 'SOLICITUD_RECHAZADA')).toEqual([ids.est1]);
    obs(`Supervisor con motivo → ${ok.status}: RECHAZADA; notificado el estudiante`);
    const again = await status(u.admin, id, 'CERRADA');
    expect(again.status).toBe(409);
    obs(`Transición posterior → ${again.status}`);
    const asignada = await toAssigned();
    const rej = await status(u.sup, asignada, 'RECHAZADA', 'Tarde');
    expect(rej.status).toBe(409);
    obs(`Rechazar una ASIGNADA → ${rej.status} ${rej.body.error.code}`);
  });

  caso('CP17', async (obs) => {
    const id = await toInProcess();
    const ok = await assign(u.sup, id, ids.func2);
    expect(ok.status).toBe(200);
    expect((await row(id)).estado).toBe('EN_PROCESO');
    const asg = (await query('SELECT id_funcionario, activo, finalizado_en FROM asignaciones WHERE id_solicitud = $1 ORDER BY id_asignacion', [id])).rows;
    expect(asg).toHaveLength(2);
    expect(asg[0]).toEqual(expect.objectContaining({ id_funcionario: ids.func, activo: false }));
    expect(asg[0].finalizado_en).toBeTruthy();
    expect(asg[1]).toEqual(expect.objectContaining({ id_funcionario: ids.func2, activo: true }));
    obs(`Reasignación → ${ok.status}: sigue EN_PROCESO; asignación previa finalizada y nueva activa`);
    expect(await notifs(id, 'SOLICITUD_REASIGNADA')).toEqual(expect.arrayContaining([ids.est1, ids.func2, ids.func]));
    const aud = await query("SELECT 1 FROM auditoria WHERE operacion = 'SOLICITUD_REASIGNADA' AND id_recurso = $1", [String(id)]);
    expect(aud.rowCount).toBe(1);
    obs('Notificados estudiante, funcionario nuevo y anterior; 1 registro de auditoría SOLICITUD_REASIGNADA');
    const lost = await respond(u.func, id, 'Ya no es mía');
    expect(lost.status).toBe(404);
    obs(`El funcionario anterior intenta responder → ${lost.status}`);
  });

  caso('CP18', async (obs) => {
    const id = await toInProcess();
    await respond(u.func, id, 'Interno de asignación secreto', 'INTERNA');
    await respond(u.func, id, 'Avance público');
    expect((await status(u.func, id, 'RESUELTA', 'Listo')).status).toBe(200);
    const adm = await call(u.admin, 'get', `/api/requests/${id}/timeline`);
    expect(adm.status).toBe(200);
    const transiciones = adm.body.data.filter((e) => e.estado_nuevo).map((e) => e.estado_nuevo);
    expect(transiciones).toEqual(['REGISTRADA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA']);
    obs(`Administrador ve las transiciones en orden: ${transiciones.join(' → ')}`);
    const est = await call(u.est1, 'get', `/api/requests/${id}/timeline`);
    const txt = JSON.stringify(est.body.data);
    expect(txt).not.toMatch(/secreto/);
    expect(txt).not.toMatch(/SUPERVISOR|ADMINISTRADOR/);
    expect(est.body.data.find((e) => e.estado_nuevo === 'ASIGNADA').usuario).toBe('Gestión de solicitudes');
    obs('El estudiante ve "Gestión de solicitudes", sin respuestas internas ni roles');
    await expect(query('UPDATE historial_estados SET observacion = $2 WHERE id_solicitud = $1', [id, 'manipulado'])).rejects.toThrow();
    await expect(query('DELETE FROM historial_estados WHERE id_solicitud = $1', [id])).rejects.toThrow();
    obs('UPDATE y DELETE directos sobre historial_estados rechazados por la base de datos');
    expect((await call(u.est2, 'get', `/api/requests/${id}/timeline`)).status).toBe(404);
    obs('Estudiante ajeno → 404');
  });

  caso('CP19', async (obs) => {
    const id = await toResolved();
    const count = (await call(u.est1, 'get', '/api/notifications/unread-count')).body.data.no_leidas;
    const list = await call(u.est1, 'get', '/api/notifications?pageSize=100');
    const noLeidas = list.body.data.filter((n) => !n.leida);
    expect(count).toBeGreaterThan(0);
    expect(count).toBe(noLeidas.length);
    obs(`Contador ${count} = ${noLeidas.length} no leídas en la lista`);
    const una = noLeidas[0];
    const ajeno = await call(u.est2, 'patch', `/api/notifications/${una.id_notificacion}/read`);
    expect(ajeno.status).toBe(404);
    obs(`Otro usuario intenta marcarla → ${ajeno.status}`);
    expect((await call(u.est1, 'patch', `/api/notifications/${una.id_notificacion}/read`)).status).toBe(200);
    const tras = (await call(u.est1, 'get', '/api/notifications/unread-count')).body.data.no_leidas;
    expect(tras).toBe(count - 1);
    obs(`Tras marcar una: ${tras}`);
    expect((await call(u.est1, 'patch', '/api/notifications/read-all')).status).toBe(200);
    expect((await call(u.est1, 'get', '/api/notifications/unread-count')).body.data.no_leidas).toBe(0);
    obs('Tras marcar todas: 0');
    const propias = await query("SELECT 1 FROM notificaciones WHERE id_solicitud = $1 AND id_usuario = $2 AND tipo IN ('SOLICITUD_INICIADA','SOLICITUD_RESUELTA','NUEVA_RESPUESTA')", [id, ids.func]);
    expect(propias.rowCount).toBe(0);
    obs('El funcionario no recibió notificaciones de sus propias acciones');
  });

  caso('CP20', async (obs, ev) => {
    const rep = await call(u.admin, 'get', '/api/reports/by-status');
    expect(rep.status).toBe(200);
    expect(rep.body.data.periodo).toBeTruthy();
    expect(rep.body.data.ambito).toBeTruthy();
    const total = rep.body.data.filas.reduce((a, f) => a + f.total, 0);
    expect(total).toBeGreaterThan(0);
    obs(`Administrador: by-status 200, ${total} solicitudes en el período, con período y ámbito`);
    const csv = await call(u.admin, 'get', '/api/reports/by-status?formato=csv');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    obs(`CSV → ${csv.status} ${csv.headers['content-type']}`);
    expect((await call(u.est1, 'get', '/api/reports/by-status')).status).toBe(403);
    expect((await call(u.est1, 'get', '/api/dashboard')).status).toBe(200);
    obs('Estudiante: reportes 403, dashboard 200');
    const ajeno = await call(u.supOtro, 'get', '/api/reports/by-status');
    expect(ajeno.status).toBe(200);
    expect(ajeno.body.data.filas.reduce((a, f) => a + f.total, 0)).toBe(0);
    obs('Supervisor de otra dependencia: 0 solicitudes (solo su ámbito)');
    const aud = await call(u.admin, 'get', '/api/audit?operacion=SOLICITUD_ASIGNADA');
    expect(aud.status).toBe(200);
    expect(aud.body.data.length).toBeGreaterThan(0);
    expect(aud.body.data.every((a) => a.operacion === 'SOLICITUD_ASIGNADA')).toBe(true);
    obs(`Auditoría filtrada: ${aud.body.data.length} registros SOLICITUD_ASIGNADA`);
    for (const who of [u.est1, u.sup, u.func]) expect((await call(who, 'get', '/api/audit')).status).toBe(403);
    obs('Estudiante, supervisor y funcionario → 403 en auditoría');
    const first = aud.body.data[0].id_auditoria;
    for (const method of ['put', 'patch', 'delete', 'post']) {
      const res = await call(u.admin, method, `/api/audit/${first}`, method === 'delete' ? undefined : {});
      expect(res.status).toBe(404);
    }
    obs('PUT/PATCH/DELETE/POST sobre un registro de auditoría → 404');
    ev('Respuestas de reportes, CSV y auditoría');
  });

  test('los 20 casos quedaron definidos y registrados', () => {
    expect(CASOS.map((c) => c.id)).toEqual(Array.from({ length: 20 }, (_, i) => `CP${String(i + 1).padStart(2, '0')}`));
  });
});
