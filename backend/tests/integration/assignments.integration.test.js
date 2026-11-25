'use strict';

const request = require('supertest');

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

describeDb('Asignación y reasignación con PostgreSQL real', () => {
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

  const assignTo = (who, idSolicitud, idFuncionario, extra = {}) => call(who, 'post', `/api/requests/${idSolicitud}/assignment`, { id_funcionario: idFuncionario, ...extra });

  const newRequest = async (over = {}) => {
    const res = await call(u.est1, 'post', '/api/requests', { id_servicio: ids.servicio, asunto: `Asunto ${Math.random()}`, descripcion: 'Descripción', ...over });
    expect(res.status).toBe(201);
    return res.body.data;
  };

  const setState = (idSolicitud, estado) => query('UPDATE solicitudes SET estado = $2 WHERE id_solicitud = $1', [idSolicitud, estado]);
  const activeRows = async (idSolicitud) => (await query('SELECT id_funcionario FROM asignaciones WHERE id_solicitud = $1 AND activo', [idSolicitud])).rows;

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
    const dep = await call(u.admin, 'post', '/api/dependencies', { nombre: `Dep Asig ${sufijo}` });
    const dep2 = await call(u.admin, 'post', '/api/dependencies', { nombre: `Dep Otra ${sufijo}` });
    ids.dep = dep.body.data.id_dependencia;
    ids.dep2 = dep2.body.data.id_dependencia;
    const cat = await call(u.admin, 'post', '/api/categories', { nombre: `Cat Asig ${sufijo}` });
    const sv = await call(u.admin, 'post', '/api/services', { nombre: `Servicio ${sufijo}`, id_categoria: cat.body.data.id_categoria, id_dependencia: ids.dep });
    ids.servicio = sv.body.data.id_servicio;

    ids.est1 = await mk('ESTUDIANTE', 'est1');
    ids.est2 = await mk('ESTUDIANTE', 'est2');
    ids.func = await mk('FUNCIONARIO', 'func', ids.dep);
    ids.func2 = await mk('FUNCIONARIO', 'func2', ids.dep);
    ids.funcOtra = await mk('FUNCIONARIO', 'funcotra', ids.dep2);
    ids.funcInactivo = await mk('FUNCIONARIO', 'funcina', ids.dep);
    await query('UPDATE usuarios SET activo = FALSE WHERE id_usuario = $1', [ids.funcInactivo]);
    ids.sup = await mk('SUPERVISOR', 'sup');
    ids.sup2 = await mk('SUPERVISOR', 'sup2');
    await query('INSERT INTO supervision_dependencia (id_supervisor, id_dependencia) VALUES ($1, $2)', [ids.sup, ids.dep]);
    await query('INSERT INTO supervision_dependencia (id_supervisor, id_dependencia) VALUES ($1, $2)', [ids.sup2, ids.dep2]);
    for (const key of ['est1', 'est2', 'func', 'func2', 'sup', 'sup2']) u[key] = await login(`${key}-${sufijo}@prueba.edu`);
  });

  afterAll(async () => {
    if (closePool) await closePool();
  });

  describe('GET /api/officials', () => {
    test('administrador: solo funcionarios activos, filtrables por dependencia, con su carga', async () => {
      const res = await call(u.admin, 'get', '/api/officials?pageSize=100');
      expect(res.status).toBe(200);
      const found = res.body.data.map((o) => o.id_usuario);
      expect(found).toEqual(expect.arrayContaining([ids.func, ids.func2, ids.funcOtra]));
      expect(found).not.toContain(ids.funcInactivo); // inactivo
      expect(found).not.toContain(ids.est1); // no es funcionario
      expect(found).not.toContain(ids.sup);
      expect(res.body.data[0]).toEqual(expect.objectContaining({ dependencia: expect.any(String), carga_activa: expect.any(Number) }));
      expect(JSON.stringify(res.body)).not.toMatch(/password_hash/);

      const filtered = await call(u.admin, 'get', `/api/officials?id_dependencia=${ids.dep2}&pageSize=100`);
      expect(filtered.body.data.map((o) => o.id_usuario)).toEqual([ids.funcOtra]);

      const byName = await call(u.admin, 'get', `/api/officials?q=func2-${sufijo}`);
      expect(byName.body.data.map((o) => o.id_usuario)).toEqual([ids.func2]);
    });

    test('supervisor: solo funcionarios de las dependencias que supervisa', async () => {
      const own = await call(u.sup, 'get', '/api/officials?pageSize=100');
      expect(own.body.data.map((o) => o.id_usuario).sort()).toEqual([ids.func, ids.func2].sort());
      const other = await call(u.sup2, 'get', '/api/officials?pageSize=100');
      expect(other.body.data.map((o) => o.id_usuario)).toEqual([ids.funcOtra]);
      // pedir otra dependencia no amplía su alcance
      const forced = await call(u.sup, 'get', `/api/officials?id_dependencia=${ids.dep2}`);
      expect(forced.body.data).toEqual([]);
    });

    test('estudiante y funcionario => 403; sin sesión => 401', async () => {
      expect((await call(u.est1, 'get', '/api/officials')).status).toBe(403);
      expect((await call(u.func, 'get', '/api/officials')).status).toBe(403);
      expect((await request(app).get('/api/officials')).status).toBe(401);
    });

    test('la carga cuenta solo solicitudes abiertas a su cargo', async () => {
      const antes = (await call(u.admin, 'get', `/api/officials?q=func2-${sufijo}`)).body.data[0].carga_activa;
      const r = await newRequest();
      await assignTo(u.admin, r.id_solicitud, ids.func2);
      const despues = (await call(u.admin, 'get', `/api/officials?q=func2-${sufijo}`)).body.data[0].carga_activa;
      expect(despues).toBe(antes + 1);
    });
  });

  describe('primera asignación', () => {
    test('administrador asigna: ASIGNADA, asignación activa, historial, auditoría y notificaciones', async () => {
      const r = await newRequest();
      const res = await assignTo(u.admin, r.id_solicitud, ids.func, { observacion: ' Caso prioritario ' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id_solicitud: r.id_solicitud, estado: 'ASIGNADA', id_funcionario: ids.func, funcionario: `func Prueba` });

      const rows = (await query('SELECT id_funcionario, id_asignador, activo, finalizado_en, observacion FROM asignaciones WHERE id_solicitud = $1', [r.id_solicitud])).rows;
      expect(rows).toEqual([{ id_funcionario: ids.func, id_asignador: ids.admin, activo: true, finalizado_en: null, observacion: 'Caso prioritario' }]);

      const hist = (await query('SELECT estado_anterior, estado_nuevo, id_usuario FROM historial_estados WHERE id_solicitud = $1 ORDER BY id_historial', [r.id_solicitud])).rows;
      expect(hist).toEqual([
        { estado_anterior: null, estado_nuevo: 'REGISTRADA', id_usuario: ids.est1 },
        { estado_anterior: 'REGISTRADA', estado_nuevo: 'ASIGNADA', id_usuario: ids.admin },
      ]);

      const aud = (await query("SELECT detalle FROM auditoria WHERE operacion = 'SOLICITUD_ASIGNADA' AND id_recurso = $1", [String(r.id_solicitud)])).rows;
      expect(aud).toHaveLength(1);
      expect(aud[0].detalle).toMatchObject({ de: null, a: ids.func, estado_anterior: 'REGISTRADA', estado_nuevo: 'ASIGNADA' });

      const notes = (await query('SELECT id_usuario, tipo, leida FROM notificaciones WHERE id_solicitud = $1 AND tipo = \'SOLICITUD_ASIGNADA\' ORDER BY id_usuario', [r.id_solicitud])).rows;
      expect(notes.map((n) => [n.id_usuario, n.tipo, n.leida]).sort()).toEqual([[ids.est1, 'SOLICITUD_ASIGNADA', false], [ids.func, 'SOLICITUD_ASIGNADA', false]].sort());
    });

    test('el supervisor asigna dentro de su ámbito; fuera de su ámbito => 404', async () => {
      const r = await newRequest();
      expect((await assignTo(u.sup2, r.id_solicitud, ids.func)).status).toBe(404);
      expect((await activeRows(r.id_solicitud))).toEqual([]);
      const ok = await assignTo(u.sup, r.id_solicitud, ids.func);
      expect(ok.status).toBe(200);
      const row = (await query('SELECT id_asignador FROM asignaciones WHERE id_solicitud = $1', [r.id_solicitud])).rows[0];
      expect(row.id_asignador).toBe(ids.sup);
    });

    test('estudiante y funcionario no pueden asignar => 403', async () => {
      const r = await newRequest();
      expect((await assignTo(u.est1, r.id_solicitud, ids.func)).status).toBe(403);
      expect((await assignTo(u.func, r.id_solicitud, ids.func)).status).toBe(403);
      expect((await assignTo(u.sup, 999999999, ids.func)).status).toBe(404);
    });

    test('valida al funcionario: inexistente, no funcionario, inactivo y de otra dependencia', async () => {
      const r = await newRequest();
      expect((await assignTo(u.admin, r.id_solicitud, 999999999)).status).toBe(404);
      const cases = [
        [ids.est2, 'NOT_AN_OFFICIAL'],
        [ids.sup, 'NOT_AN_OFFICIAL'],
        [ids.funcInactivo, 'OFFICIAL_INACTIVE'],
        [ids.funcOtra, 'OFFICIAL_WRONG_DEPENDENCY'],
      ];
      for (const [id, code] of cases) {
        // eslint-disable-next-line no-await-in-loop
        const res = await assignTo(u.admin, r.id_solicitud, id);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe(code);
      }
      expect((await activeRows(r.id_solicitud))).toEqual([]);
      expect((await call(u.admin, 'get', `/api/requests/${r.id_solicitud}`)).body.data.estado).toBe('REGISTRADA');
    });

    test('cuerpo inválido => 400 (el cliente no puede fijar asignador ni estado)', async () => {
      const r = await newRequest();
      for (const body of [{}, { id_funcionario: 'x' }, { id_funcionario: ids.func, id_asignador: ids.admin }, { id_funcionario: ids.func, estado: 'EN_PROCESO' }, { id_funcionario: ids.func, observacion: 'x'.repeat(501) }]) {
        // eslint-disable-next-line no-await-in-loop
        const res = await call(u.admin, 'post', `/api/requests/${r.id_solicitud}/assignment`, body);
        expect(res.status).toBe(400);
      }
    });

    test('sin token CSRF => 403', async () => {
      const r = await newRequest();
      const res = await u.admin.agent.post(`/api/requests/${r.id_solicitud}/assignment`).send({ id_funcionario: ids.func });
      expect(res.status).toBe(403);
    });
  });

  describe('reasignación', () => {
    test('ASIGNADA: cambia de responsable sin cambiar el estado; conserva el historial de asignaciones', async () => {
      const r = await newRequest();
      await assignTo(u.admin, r.id_solicitud, ids.func);
      const res = await assignTo(u.sup, r.id_solicitud, ids.func2, { observacion: 'Carga de trabajo' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ estado: 'ASIGNADA', id_funcionario: ids.func2 });

      const rows = (await query('SELECT id_funcionario, activo, finalizado_en IS NOT NULL AS cerrada FROM asignaciones WHERE id_solicitud = $1 ORDER BY id_asignacion', [r.id_solicitud])).rows;
      expect(rows).toEqual([
        { id_funcionario: ids.func, activo: false, cerrada: true },
        { id_funcionario: ids.func2, activo: true, cerrada: false },
      ]);

      // el estado no cambia => sin fila nueva de historial de estados
      const hist = (await query('SELECT estado_nuevo FROM historial_estados WHERE id_solicitud = $1 ORDER BY id_historial', [r.id_solicitud])).rows.map((h) => h.estado_nuevo);
      expect(hist).toEqual(['REGISTRADA', 'ASIGNADA']);

      const aud = (await query("SELECT detalle FROM auditoria WHERE operacion = 'SOLICITUD_REASIGNADA' AND id_recurso = $1", [String(r.id_solicitud)])).rows;
      expect(aud[0].detalle).toMatchObject({ de: ids.func, a: ids.func2, estado_anterior: 'ASIGNADA', estado_nuevo: 'ASIGNADA' });

      const notes = (await query("SELECT id_usuario FROM notificaciones WHERE id_solicitud = $1 AND tipo = 'SOLICITUD_REASIGNADA'", [r.id_solicitud])).rows.map((n) => n.id_usuario).sort();
      expect(notes).toEqual([ids.est1, ids.func, ids.func2].sort()); // estudiante, nuevo y anterior

      // visibilidad: el anterior pierde el acceso, el nuevo lo gana
      expect((await call(u.func, 'get', `/api/requests/${r.id_solicitud}`)).status).toBe(404);
      expect((await call(u.func2, 'get', `/api/requests/${r.id_solicitud}`)).status).toBe(200);
    });

    test('EN_PROCESO: el estado se conserva', async () => {
      const r = await newRequest();
      await assignTo(u.admin, r.id_solicitud, ids.func);
      await setState(r.id_solicitud, 'EN_PROCESO');
      const res = await assignTo(u.admin, r.id_solicitud, ids.func2);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ estado: 'EN_PROCESO', id_funcionario: ids.func2 });
    });

    test('REABIERTA: reasignar ejecuta REABIERTA → ASIGNADA con historial', async () => {
      const r = await newRequest();
      await assignTo(u.admin, r.id_solicitud, ids.func);
      await setState(r.id_solicitud, 'EN_PROCESO');
      await query("UPDATE solicitudes SET estado = 'RESUELTA', fecha_resolucion = NOW() WHERE id_solicitud = $1", [r.id_solicitud]);
      await query("INSERT INTO historial_estados (id_solicitud, estado_anterior, estado_nuevo, id_usuario, observacion) VALUES ($1, 'RESUELTA', 'REABIERTA', $2, 'No quedó resuelto')", [r.id_solicitud, ids.est1]);
      await query("UPDATE solicitudes SET estado = 'REABIERTA' WHERE id_solicitud = $1", [r.id_solicitud]);

      const res = await assignTo(u.admin, r.id_solicitud, ids.func2);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ estado: 'ASIGNADA', id_funcionario: ids.func2 });
      const last = (await query('SELECT estado_anterior, estado_nuevo FROM historial_estados WHERE id_solicitud = $1 ORDER BY id_historial DESC LIMIT 1', [r.id_solicitud])).rows[0];
      expect(last).toEqual({ estado_anterior: 'REABIERTA', estado_nuevo: 'ASIGNADA' });
    });

    test('mismo funcionario => 409 SAME_ASSIGNEE y nada cambia', async () => {
      const r = await newRequest();
      await assignTo(u.admin, r.id_solicitud, ids.func);
      const res = await assignTo(u.admin, r.id_solicitud, ids.func);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SAME_ASSIGNEE');
      expect((await query('SELECT COUNT(*)::int AS n FROM asignaciones WHERE id_solicitud = $1', [r.id_solicitud])).rows[0].n).toBe(1);
    });

    test('RESUELTA => INVALID_STATE; CERRADA y RECHAZADA => REQUEST_CLOSED', async () => {
      const resuelta = await newRequest();
      await assignTo(u.admin, resuelta.id_solicitud, ids.func);
      await setState(resuelta.id_solicitud, 'EN_PROCESO');
      await query("UPDATE solicitudes SET estado = 'RESUELTA', fecha_resolucion = NOW() WHERE id_solicitud = $1", [resuelta.id_solicitud]);
      const a = await assignTo(u.admin, resuelta.id_solicitud, ids.func2);
      expect([a.status, a.body.error.code]).toEqual([409, 'INVALID_STATE']);

      const rechazada = await newRequest();
      await query("UPDATE solicitudes SET estado = 'RECHAZADA' WHERE id_solicitud = $1", [rechazada.id_solicitud]);
      const b = await assignTo(u.admin, rechazada.id_solicitud, ids.func);
      expect([b.status, b.body.error.code]).toEqual([409, 'REQUEST_CLOSED']);

      const cerrada = await newRequest();
      await assignTo(u.admin, cerrada.id_solicitud, ids.func);
      await setState(cerrada.id_solicitud, 'EN_PROCESO');
      await query("UPDATE solicitudes SET estado = 'RESUELTA', fecha_resolucion = NOW() WHERE id_solicitud = $1", [cerrada.id_solicitud]);
      await query('UPDATE asignaciones SET activo = FALSE, finalizado_en = NOW() WHERE id_solicitud = $1', [cerrada.id_solicitud]);
      await query("UPDATE solicitudes SET estado = 'CERRADA', fecha_cierre = NOW() WHERE id_solicitud = $1", [cerrada.id_solicitud]);
      const c = await assignTo(u.admin, cerrada.id_solicitud, ids.func2);
      expect([c.status, c.body.error.code]).toEqual([409, 'REQUEST_CLOSED']);
    });
  });

  describe('concurrencia y atomicidad', () => {
    test('dos asignaciones simultáneas al mismo funcionario: una gana y la otra es SAME_ASSIGNEE', async () => {
      const r = await newRequest();
      const results = await Promise.all([assignTo(u.admin, r.id_solicitud, ids.func), assignTo(u.sup, r.id_solicitud, ids.func)]);
      expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
      expect((await activeRows(r.id_solicitud))).toEqual([{ id_funcionario: ids.func }]);
    });

    test('simultáneas a funcionarios distintos: siempre queda exactamente una asignación activa', async () => {
      const r = await newRequest();
      const results = await Promise.all([assignTo(u.admin, r.id_solicitud, ids.func), assignTo(u.sup, r.id_solicitud, ids.func2)]);
      expect(results.map((x) => [x.status, x.body.error && x.body.error.code])).toEqual([[200, null], [200, null]]);
      expect((await activeRows(r.id_solicitud))).toHaveLength(1);
      expect((await query('SELECT COUNT(*)::int AS n FROM asignaciones WHERE id_solicitud = $1', [r.id_solicitud])).rows[0].n).toBe(2);
    });

    test('si falla una notificación, todo se revierte (estado, asignación, historial y auditoría)', async () => {
      const r = await newRequest();
      const notificationRepository = require('../../src/repositories/notification.repository');
      const original = notificationRepository.insertMany;
      notificationRepository.insertMany = async () => { throw new Error('fallo simulado'); };
      let res;
      try {
        res = await assignTo(u.admin, r.id_solicitud, ids.func);
      } finally {
        notificationRepository.insertMany = original;
      }
      expect(res.status).toBe(500);
      expect((await activeRows(r.id_solicitud))).toEqual([]);
      expect((await call(u.admin, 'get', `/api/requests/${r.id_solicitud}`)).body.data.estado).toBe('REGISTRADA');
      const hist = (await query('SELECT COUNT(*)::int AS n FROM historial_estados WHERE id_solicitud = $1', [r.id_solicitud])).rows[0].n;
      expect(hist).toBe(1);
      const aud = (await query("SELECT COUNT(*)::int AS n FROM auditoria WHERE operacion = 'SOLICITUD_ASIGNADA' AND id_recurso = $1", [String(r.id_solicitud)])).rows[0].n;
      expect(aud).toBe(0);
    });
  });

  describe('GET /api/requests/:id/assignments', () => {
    test('historial de asignaciones, más reciente primero, visible según el alcance', async () => {
      const r = await newRequest();
      await assignTo(u.admin, r.id_solicitud, ids.func);
      await assignTo(u.admin, r.id_solicitud, ids.func2);
      const res = await call(u.sup, 'get', `/api/requests/${r.id_solicitud}/assignments`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((a) => [a.id_funcionario, a.activo])).toEqual([[ids.func2, true], [ids.func, false]]);
      expect(res.body.data[0]).toMatchObject({ funcionario: 'func2 Prueba', asignador: 'adm Prueba' });
      expect(res.body.data[1].finalizado_en).toBeTruthy();

      expect((await call(u.admin, 'get', `/api/requests/${r.id_solicitud}/assignments`)).status).toBe(200);
      expect((await call(u.func2, 'get', `/api/requests/${r.id_solicitud}/assignments`)).status).toBe(200);
      expect((await call(u.est1, 'get', `/api/requests/${r.id_solicitud}/assignments`)).status).toBe(200);
      expect((await call(u.est2, 'get', `/api/requests/${r.id_solicitud}/assignments`)).status).toBe(404);
      expect((await call(u.sup2, 'get', `/api/requests/${r.id_solicitud}/assignments`)).status).toBe(404);
      expect((await call(u.func, 'get', `/api/requests/${r.id_solicitud}/assignments`)).status).toBe(404);
    });
  });

  describe('integración con la baja de funcionarios (Fase 5A)', () => {
    test('un funcionario con solicitudes activas no puede desactivarse hasta reasignar', async () => {
      const r = await newRequest();
      await assignTo(u.admin, r.id_solicitud, ids.func);
      const blocked = await call(u.admin, 'patch', `/api/users/${ids.func}/status`, { activo: false });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('HAS_ACTIVE_ASSIGNMENTS');
      await assignTo(u.admin, r.id_solicitud, ids.func2);
      const own = await call(u.admin, 'get', `/api/officials?q=func-${sufijo}`);
      expect(own.body.data[0].id_usuario).toBe(ids.func);
    });
  });
});
