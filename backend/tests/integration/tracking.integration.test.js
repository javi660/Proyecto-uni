'use strict';

const request = require('supertest');

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

describeDb('Seguimiento: estados, respuestas, historial y línea de tiempo (PostgreSQL real)', () => {
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

  const status = async (who, id, estado, observacion) => { const r = await call(who, 'patch', `/api/requests/${id}/status`, observacion === undefined ? { estado } : { estado, observacion }); return r; };
  const respond = (who, id, contenido, visibilidad) => call(who, 'post', `/api/requests/${id}/responses`, visibilidad ? { contenido, visibilidad } : { contenido });

  const newRequest = async () => {
    const res = await call(u.est1, 'post', '/api/requests', { id_servicio: ids.servicio, asunto: `Asunto ${Math.random()}`, descripcion: 'Descripción' });
    expect(res.status).toBe(201);
    return res.body.data.id_solicitud;
  };
  const assigned = async (func = 'func') => {
    const id = await newRequest();
    const res = await call(u.admin, 'post', `/api/requests/${id}/assignment`, { id_funcionario: ids[func] });
    expect(res.status).toBe(200);
    return id;
  };
  const inProcess = async () => {
    const id = await assigned();
    expect((await status(u.func, id, 'EN_PROCESO')).status).toBe(200);
    return id;
  };
  const resolved = async () => {
    const id = await inProcess();
    expect((await respond(u.func, id, 'Solución aplicada')).status).toBe(201);
    expect((await status(u.func, id, 'RESUELTA', 'Listo')).status).toBe(200);
    return id;
  };
  const notifs = async (id, tipo) => (await query('SELECT id_usuario FROM notificaciones WHERE id_solicitud = $1 AND tipo = $2 ORDER BY id_usuario', [id, tipo])).rows.map((r) => r.id_usuario);
  const state = async (id) => (await query('SELECT * FROM solicitudes WHERE id_solicitud = $1', [id])).rows[0];

  beforeAll(async () => {
    const { createApp } = require('../../src/app');
    ({ query, closePool } = require('../../src/config/database'));
    const userRepository = require('../../src/repositories/user.repository');
    const { hashPassword } = require('../../src/utils/password');
    app = createApp();
    const hash = await hashPassword(PASSWORD);
    const mk = async (rol, key, idDependencia = null) => {
      const created = await userRepository.create({
        nombres: key, apellidos: 'Prueba', correo: `${key}-${sufijo}@prueba.edu`, passwordHash: hash, rol, idDependencia, debeCambiarPassword: false,
      });
      return created.id_usuario;
    };
    ids.admin = await mk('ADMINISTRADOR', 'adm');
    u.admin = await login(`adm-${sufijo}@prueba.edu`);
    const dep = await call(u.admin, 'post', '/api/dependencies', { nombre: `Dep Seg ${sufijo}` });
    const dep2 = await call(u.admin, 'post', '/api/dependencies', { nombre: `Dep Otra ${sufijo}` });
    ids.dep = dep.body.data.id_dependencia;
    const cat = await call(u.admin, 'post', '/api/categories', { nombre: `Cat Seg ${sufijo}` });
    const sv = await call(u.admin, 'post', '/api/services', { nombre: `Servicio ${sufijo}`, id_categoria: cat.body.data.id_categoria, id_dependencia: ids.dep });
    ids.servicio = sv.body.data.id_servicio;
    ids.est1 = await mk('ESTUDIANTE', 'est1');
    ids.est2 = await mk('ESTUDIANTE', 'est2');
    ids.func = await mk('FUNCIONARIO', 'func', ids.dep);
    ids.func2 = await mk('FUNCIONARIO', 'func2', ids.dep);
    ids.sup = await mk('SUPERVISOR', 'sup');
    ids.supOtro = await mk('SUPERVISOR', 'supotro');
    await query('INSERT INTO supervision_dependencia (id_supervisor, id_dependencia) VALUES ($1, $2)', [ids.sup, ids.dep]);
    await query('INSERT INTO supervision_dependencia (id_supervisor, id_dependencia) VALUES ($1, $2)', [ids.supOtro, dep2.body.data.id_dependencia]);
    for (const key of ['est1', 'est2', 'func', 'func2', 'sup', 'supOtro']) u[key] = await login(`${key.toLowerCase()}-${sufijo}@prueba.edu`);
  });

  afterAll(async () => {
    if (closePool) await closePool();
  });

  describe('ciclo completo', () => {
    test('iniciar → responder → resolver → cerrar, con historial, fechas y notificaciones', async () => {
      const id = await assigned();
      let res = await status(u.func, id, 'EN_PROCESO');
      expect(res.status).toBe(200);
      expect(res.body.data.estado).toBe('EN_PROCESO');
      expect(await notifs(id, 'SOLICITUD_INICIADA')).toEqual([ids.est1]);

      res = await respond(u.func, id, 'Estamos revisando');
      expect(res.status).toBe(201);
      expect(res.body.data).toEqual(expect.objectContaining({ visibilidad: 'PUBLICA', contenido: 'Estamos revisando' }));
      expect(await notifs(id, 'NUEVA_RESPUESTA')).toEqual([ids.est1]);

      res = await status(u.func, id, 'RESUELTA', 'Problema corregido');
      expect(res.status).toBe(200);
      expect((await state(id)).fecha_resolucion).not.toBeNull();
      expect(await notifs(id, 'SOLICITUD_RESUELTA')).toEqual([ids.est1]);

      res = await status(u.est1, id, 'CERRADA');
      expect(res.status).toBe(200);
      const row = await state(id);
      expect(row.estado).toBe('CERRADA');
      expect(row.fecha_cierre).not.toBeNull();
      expect((await query('SELECT activo FROM asignaciones WHERE id_solicitud = $1', [id])).rows.every((r) => r.activo === false)).toBe(true);
      expect(await notifs(id, 'SOLICITUD_CERRADA')).toEqual([ids.func]); // el actor (estudiante) no se notifica

      const hist = (await query('SELECT estado_anterior, estado_nuevo, observacion_publica FROM historial_estados WHERE id_solicitud = $1 ORDER BY id_historial', [id])).rows;
      expect(hist.map((h) => h.estado_nuevo)).toEqual(['REGISTRADA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA']);
      expect(hist[3].observacion_publica).toBe(true);
      const audit = (await query("SELECT count(*)::int AS n FROM auditoria WHERE operacion IN ('SOLICITUD_INICIADA','SOLICITUD_RESUELTA','SOLICITUD_CERRADA') AND id_recurso = $1", [String(id)])).rows[0].n;
      expect(audit).toBe(3); // iniciada, resuelta, cerrada (la respuesta se audita con el id de la respuesta)
      const respAudit = (await query("SELECT count(*)::int AS n FROM auditoria WHERE operacion = 'RESPUESTA_CREADA' AND recurso = 'respuestas'")).rows[0].n;
      expect(respAudit).toBeGreaterThanOrEqual(1);
    });

    test('reabrir exige motivo, notifica al funcionario y supervisores, y vuelve a iniciar', async () => {
      const id = await resolved();
      expect((await status(u.est1, id, 'REABIERTA')).status).toBe(400);
      const res = await status(u.est1, id, 'REABIERTA', 'Sigue fallando');
      expect(res.status).toBe(200);
      expect(await notifs(id, 'SOLICITUD_REABIERTA')).toEqual([ids.func, ids.sup].sort((a, b) => a - b));
      expect((await status(u.func, id, 'EN_PROCESO')).status).toBe(200);
      // la respuesta del ciclo anterior no sirve para resolver de nuevo
      const again = await status(u.func, id, 'RESUELTA');
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('RESPONSE_REQUIRED');
      await respond(u.func, id, 'Segunda solución');
      expect((await status(u.func, id, 'RESUELTA')).status).toBe(200);
    });

    test('rechazar (supervisor en alcance) exige motivo, notifica al estudiante y es final', async () => {
      const id = await newRequest();
      expect((await status(u.sup, id, 'RECHAZADA')).status).toBe(400);
      const res = await status(u.sup, id, 'RECHAZADA', 'Fuera de competencia');
      expect(res.status).toBe(200);
      expect(await notifs(id, 'SOLICITUD_RECHAZADA')).toEqual([ids.est1]);
      const again = await status(u.admin, id, 'RECHAZADA', 'otra vez');
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('REQUEST_CLOSED');
    });
  });

  describe('permisos y reglas', () => {
    test('resolver sin respuesta pública → 409 RESPONSE_REQUIRED (una interna no cuenta)', async () => {
      const id = await inProcess();
      await respond(u.func, id, 'Nota interna', 'INTERNA');
      const res = await status(u.func, id, 'RESUELTA');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESPONSE_REQUIRED');
      expect((await state(id)).estado).toBe('EN_PROCESO');
    });

    test('transiciones inválidas → 409 INVALID_TRANSITION', async () => {
      const id = await assigned();
      for (const [who, estado] of [[u.func, 'RESUELTA'], [u.admin, 'RECHAZADA']]) {
        const res = await status(who, id, estado, 'x');
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('INVALID_TRANSITION');
      }
      expect((await status(u.func, id, 'ASIGNADA')).status).toBe(400);
    });

    test('solo el funcionario asignado atiende; otro funcionario, admin y supervisor no', async () => {
      const id = await assigned();
      expect((await status(u.func2, id, 'EN_PROCESO')).status).toBe(404); // fuera de su alcance
      expect((await status(u.admin, id, 'EN_PROCESO')).status).toBe(403);
      expect((await status(u.sup, id, 'EN_PROCESO')).status).toBe(403);
      expect((await status(u.est1, id, 'EN_PROCESO')).status).toBe(403);
      expect((await state(id)).estado).toBe('ASIGNADA');
    });

    test('cerrar: no el funcionario; reabrir: solo el estudiante dueño; ajeno ve 404', async () => {
      const id = await resolved();
      expect((await status(u.func, id, 'CERRADA')).status).toBe(403);
      expect((await status(u.sup, id, 'REABIERTA', 'x')).status).toBe(403);
      expect((await status(u.est2, id, 'CERRADA')).status).toBe(404);
      expect((await status(u.supOtro, id, 'CERRADA')).status).toBe(404);
      expect((await status(u.sup, id, 'CERRADA')).status).toBe(200);
    });

    test('rechazar: estudiante/funcionario 403; supervisor fuera de alcance 404; solicitud inexistente 404', async () => {
      const id = await newRequest();
      expect((await status(u.est1, id, 'RECHAZADA', 'x')).status).toBe(403);
      expect((await status(u.supOtro, id, 'RECHAZADA', 'x')).status).toBe(404);
      expect((await status(u.admin, 999999999, 'RECHAZADA', 'x')).status).toBe(404);
      expect((await status(u.admin, id, 'RECHAZADA', 'Duplicada')).status).toBe(200);
    });

    test('estados finales: cualquier cambio, respuesta o prioridad → 409', async () => {
      const id = await resolved();
      await status(u.est1, id, 'CERRADA');
      expect((await status(u.est1, id, 'REABIERTA', 'x')).body.error.code).toBe('REQUEST_CLOSED');
      expect((await call(u.admin, 'patch', `/api/requests/${id}/priority`, { prioridad: 'ALTA' })).body.error.code).toBe('REQUEST_CLOSED');
      expect((await respond(u.func, id, 'tarde')).status).toBe(409);
    });

    test('cuerpo inválido → 422 y sin cambios', async () => {
      const id = await assigned();
      expect((await call(u.func, 'patch', `/api/requests/${id}/status`, { estado: 'EN_PROCESO', extra: 1 })).status).toBe(400);
      expect((await state(id)).estado).toBe('ASIGNADA');
    });

    test('transiciones concurrentes: solo una gana, historial consistente', async () => {
      const id = await resolved();
      const [a, b] = await Promise.all([status(u.est1, id, 'CERRADA'), status(u.est1, id, 'REABIERTA', 'Motivo')]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const last = (await query('SELECT estado_nuevo FROM historial_estados WHERE id_solicitud = $1 ORDER BY id_historial DESC LIMIT 1', [id])).rows[0].estado_nuevo;
      expect((await state(id)).estado).toBe(last);
    });
  });

  describe('respuestas', () => {
    test('solo el funcionario asignado responde, en estados de atención', async () => {
      const id = await assigned();
      expect((await respond(u.func, id, 'Hola')).status).toBe(201); // ASIGNADA permitido
      expect((await respond(u.func2, id, 'Hola')).status).toBe(404);
      expect((await respond(u.admin, id, 'Hola')).status).toBe(403);
      expect((await respond(u.est1, id, 'Hola')).status).toBe(403);
      expect((await respond(u.func, id, '  ')).status).toBe(400);
      const reg = await newRequest();
      expect((await respond(u.func, reg, 'x')).status).toBe(404); // sin asignar: fuera de su alcance
      const done = await resolved();
      const res = await respond(u.func, done, 'x');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE');
    });

    test('las internas no notifican y el estudiante nunca las ve', async () => {
      const id = await inProcess();
      await respond(u.func, id, 'Pública visible');
      await respond(u.func, id, 'Secreto del equipo', 'INTERNA');
      expect(await notifs(id, 'NUEVA_RESPUESTA')).toEqual([ids.est1]);
      expect((await query("SELECT count(*)::int AS n FROM notificaciones WHERE id_solicitud = $1 AND tipo = 'NUEVA_RESPUESTA'", [id])).rows[0].n).toBe(1);

      const student = await call(u.est1, 'get', `/api/requests/${id}/responses`);
      expect(student.status).toBe(200);
      expect(student.body.data.map((r) => r.contenido)).toEqual(['Pública visible']);
      expect(JSON.stringify(student.body)).not.toMatch(/Secreto/);
      for (const who of [u.func, u.sup, u.admin]) {
        const r = await call(who, 'get', `/api/requests/${id}/responses`);
        expect(r.body.data.map((x) => x.contenido)).toEqual(['Pública visible', 'Secreto del equipo']);
      }
      expect((await call(u.est2, 'get', `/api/requests/${id}/responses`)).status).toBe(404);
    });
  });

  describe('prioridad', () => {
    test('admin y supervisor en alcance cambian; igual → 409; funcionario/estudiante 403; ajeno 404', async () => {
      const id = await assigned();
      let res = await call(u.admin, 'patch', `/api/requests/${id}/priority`, { prioridad: 'URGENTE' });
      expect(res.status).toBe(200);
      expect(res.body.data.prioridad).toBe('URGENTE');
      expect((await call(u.admin, 'patch', `/api/requests/${id}/priority`, { prioridad: 'URGENTE' })).body.error.code).toBe('SAME_PRIORITY');
      expect((await call(u.sup, 'patch', `/api/requests/${id}/priority`, { prioridad: 'BAJA' })).status).toBe(200);
      expect((await call(u.func, 'patch', `/api/requests/${id}/priority`, { prioridad: 'ALTA' })).status).toBe(403);
      expect((await call(u.est1, 'patch', `/api/requests/${id}/priority`, { prioridad: 'ALTA' })).status).toBe(403);
      expect((await call(u.supOtro, 'patch', `/api/requests/${id}/priority`, { prioridad: 'ALTA' })).status).toBe(404);
      res = await call(u.admin, 'patch', `/api/requests/${id}/priority`, { prioridad: 'MAXIMA' });
      expect(res.status).toBe(400);
    });
  });

  describe('línea de tiempo', () => {
    test('personal ve todo; el estudiante ve solo lo público y la gestión anonimizada', async () => {
      const id = await newRequest();
      await call(u.sup, 'post', `/api/requests/${id}/assignment`, { id_funcionario: ids.func, observacion: 'Interno de asignación' });
      await status(u.func, id, 'EN_PROCESO');
      await respond(u.func, id, 'Avance público');
      await respond(u.func, id, 'Nota interna', 'INTERNA');
      await status(u.func, id, 'RESUELTA', 'Resuelto con éxito');

      const staff = await call(u.admin, 'get', `/api/requests/${id}/timeline`);
      expect(staff.status).toBe(200);
      const fechas = staff.body.data.map((e) => new Date(e.fecha).getTime());
      expect([...fechas].sort((a, b) => a - b)).toEqual(fechas);
      expect(staff.body.data.filter((e) => e.tipo === 'RESPUESTA').map((e) => e.visibilidad)).toEqual(['PUBLICA', 'INTERNA']);
      expect(staff.body.data.some((e) => e.rol_usuario === 'SUPERVISOR')).toBe(true);

      const stu = await call(u.est1, 'get', `/api/requests/${id}/timeline`);
      expect(stu.status).toBe(200);
      const txt = JSON.stringify(stu.body);
      expect(txt).not.toMatch(/Nota interna/);
      expect(txt).not.toMatch(/Interno de asignación/);
      expect(txt).not.toMatch(/SUPERVISOR|ADMINISTRADOR/);
      expect(stu.body.data.filter((e) => e.tipo === 'RESPUESTA').map((e) => e.contenido)).toEqual(['Avance público']);
      expect(stu.body.data.find((e) => e.estado_nuevo === 'ASIGNADA').usuario).toBe('Gestión de solicitudes');
      expect(stu.body.data.find((e) => e.estado_nuevo === 'RESUELTA').observacion).toBe('Resuelto con éxito');

      expect((await call(u.est2, 'get', `/api/requests/${id}/timeline`)).status).toBe(404);
      expect((await call(u.supOtro, 'get', `/api/requests/${id}/timeline`)).status).toBe(404);
    });

    test('el historial de asignaciones oculta asignador y observación al estudiante', async () => {
      const id = await newRequest();
      await call(u.sup, 'post', `/api/requests/${id}/assignment`, { id_funcionario: ids.func, observacion: 'Reservado' });
      const res = await call(u.est1, 'get', `/api/requests/${id}/assignments`);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/Reservado/);
      expect(res.body.data[0]).toEqual(expect.objectContaining({ id_asignador: null, asignador: null, observacion: null }));
    });
  });
});
