'use strict';

const request = require('supertest');

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

describeDb('Dashboard y reportes con PostgreSQL real', () => {
  const PASSWORD = 'Valida12345';
  const sufijo = Date.now().toString(36);
  const H = 3600 * 1000;
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

  /**
   * Siembra una solicitud con fechas controladas (registro, inicio de atención, resolución) recorriendo la
   * máquina de estados real: los triggers de la base validan cada paso.
   */
  async function seed({ servicio, estado, registro, atencionH, resolucionH, func = ids.func }) {
    const reg = new Date(registro);
    const at = (h) => new Date(reg.getTime() + h * H).toISOString();
    const { rows } = await query(
      'INSERT INTO solicitudes (id_estudiante, id_servicio, asunto, descripcion, fecha_registro) VALUES ($1, $2, $3, $4, $5) RETURNING id_solicitud',
      [ids.est, servicio, `Seed ${estado}`, 'Descripción', reg.toISOString()],
    );
    const id = rows[0].id_solicitud;
    const hist = (anterior, nuevo, fecha, obs = null) => query(
      'INSERT INTO historial_estados (id_solicitud, estado_anterior, estado_nuevo, id_usuario, observacion, fecha_cambio) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, anterior, nuevo, ids.admin, obs, fecha],
    );
    await hist(null, 'REGISTRADA', reg.toISOString(), 'Registrada');
    if (estado === 'RECHAZADA') {
      await query("UPDATE solicitudes SET estado = 'RECHAZADA' WHERE id_solicitud = $1", [id]);
      await hist('REGISTRADA', 'RECHAZADA', at(1), 'Rechazada');
      return id;
    }
    if (estado === 'REGISTRADA') return id;
    await query('INSERT INTO asignaciones (id_solicitud, id_funcionario, id_asignador) VALUES ($1, $2, $3)', [id, func, ids.admin]);
    await query("UPDATE solicitudes SET estado = 'ASIGNADA' WHERE id_solicitud = $1", [id]);
    await hist('REGISTRADA', 'ASIGNADA', at(1));
    if (estado === 'ASIGNADA') return id;
    await query("UPDATE solicitudes SET estado = 'EN_PROCESO' WHERE id_solicitud = $1", [id]);
    await hist('ASIGNADA', 'EN_PROCESO', at(atencionH));
    if (estado === 'EN_PROCESO') return id;
    await query("UPDATE solicitudes SET estado = 'RESUELTA', fecha_resolucion = $2 WHERE id_solicitud = $1", [id, at(resolucionH)]);
    await hist('EN_PROCESO', 'RESUELTA', at(resolucionH));
    if (estado === 'RESUELTA') return id;
    await query("UPDATE solicitudes SET estado = 'CERRADA', fecha_cierre = $2 WHERE id_solicitud = $1", [id, at(resolucionH + 1)]);
    await hist('RESUELTA', 'CERRADA', at(resolucionH + 1));
    return id;
  }

  const JAN = '/api/reports/by-category?desde=2026-01-01&hasta=2026-01-31';

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
    const depA = await call(u.admin, 'post', '/api/dependencies', { nombre: `Rep A ${sufijo}` });
    const depB = await call(u.admin, 'post', '/api/dependencies', { nombre: `Rep B ${sufijo}` });
    ids.depA = depA.body.data.id_dependencia;
    ids.depB = depB.body.data.id_dependencia;
    const catA = await call(u.admin, 'post', '/api/categories', { nombre: `Cat A ${sufijo}` });
    const catB = await call(u.admin, 'post', '/api/categories', { nombre: `Cat B ${sufijo}` });
    ids.catA = catA.body.data.id_categoria;
    ids.catB = catB.body.data.id_categoria;
    const svA = await call(u.admin, 'post', '/api/services', { nombre: `Sv A ${sufijo}`, id_categoria: ids.catA, id_dependencia: ids.depA, sla_horas: 24 });
    const svB = await call(u.admin, 'post', '/api/services', { nombre: `Sv B ${sufijo}`, id_categoria: ids.catB, id_dependencia: ids.depB, sla_horas: 24 });
    ids.svA = svA.body.data.id_servicio;
    ids.svB = svB.body.data.id_servicio;
    ids.est = await mk('ESTUDIANTE', 'est');
    ids.est2 = await mk('ESTUDIANTE', 'est2');
    ids.func = await mk('FUNCIONARIO', 'func', ids.depA);
    ids.func2 = await mk('FUNCIONARIO', 'func2', ids.depA);
    ids.sup = await mk('SUPERVISOR', 'sup');
    ids.supB = await mk('SUPERVISOR', 'supb');
    await query('INSERT INTO supervision_dependencia (id_supervisor, id_dependencia) VALUES ($1, $2)', [ids.sup, ids.depA]);
    await query('INSERT INTO supervision_dependencia (id_supervisor, id_dependencia) VALUES ($1, $2)', [ids.supB, ids.depB]);
    for (const key of ['est', 'est2', 'func', 'func2', 'sup', 'supB']) u[key] = await login(`${key.toLowerCase()}-${sufijo}@prueba.edu`);

    // Dependencia A, enero 2026 (SLA 24 h)
    await seed({ servicio: ids.svA, estado: 'CERRADA', registro: '2026-01-10T15:00:00Z', atencionH: 10, resolucionH: 20 }); // dentro del SLA
    await seed({ servicio: ids.svA, estado: 'RESUELTA', registro: '2026-01-11T15:00:00Z', atencionH: 30, resolucionH: 50 }); // fuera del SLA
    await seed({ servicio: ids.svA, estado: 'EN_PROCESO', registro: '2026-01-12T15:00:00Z', atencionH: 5 });
    await seed({ servicio: ids.svA, estado: 'REGISTRADA', registro: '2026-01-13T15:00:00Z' });
    // Febrero 2026 (dependencia A) y enero (dependencia B, otro funcionario)
    await seed({ servicio: ids.svA, estado: 'RECHAZADA', registro: '2026-02-05T15:00:00Z' });
    await seed({ servicio: ids.svB, estado: 'REGISTRADA', registro: '2026-01-14T15:00:00Z' });
    // Registrada el último día del mes en hora de Bogotá (31 ene 22:00 = 1 feb 03:00 UTC): cuenta en enero
    await seed({ servicio: ids.svA, estado: 'ASIGNADA', registro: '2026-02-01T03:00:00Z', func: ids.func2 });
    // Dependencia C (marzo 2026): categoría con nombre que parece fórmula, para probar el CSV
    const depC = await call(u.admin, 'post', '/api/dependencies', { nombre: `Rep C ${sufijo}` });
    ids.depC = depC.body.data.id_dependencia;
    const catC = await call(u.admin, 'post', '/api/categories', { nombre: `=Cat C ${sufijo}` });
    const svC = await call(u.admin, 'post', '/api/services', { nombre: `Sv C ${sufijo}`, id_categoria: catC.body.data.id_categoria, id_dependencia: ids.depC, sla_horas: 24 });
    await seed({ servicio: svC.body.data.id_servicio, estado: 'REGISTRADA', registro: '2026-03-10T15:00:00Z' });
  });

  afterAll(async () => {
    if (closePool) await closePool();
  });

  describe('permisos y validación', () => {
    test('sin sesión 401; el estudiante no accede a /reports (403) pero sí a su dashboard', async () => {
      expect((await request(app).get('/api/dashboard')).status).toBe(401);
      expect((await request(app).get('/api/reports/by-status')).status).toBe(401);
      for (const path of ['by-status', 'by-category', 'by-dependency', 'by-period']) {
        expect((await call(u.est, 'get', `/api/reports/${path}`)).status).toBe(403);
      }
      expect((await call(u.est, 'get', '/api/dashboard')).status).toBe(200);
    });

    test('parámetros inválidos → 400', async () => {
      for (const q of ['desde=hoy', 'desde=2026-03-01&hasta=2026-02-01', 'formato=xml', 'id_dependencia=0', 'otro=1']) {
        expect((await call(u.admin, 'get', `/api/reports/by-status?${q}`)).status).toBe(400);
      }
    });
  });

  describe('indicadores de la dependencia A (enero 2026, SLA 24 h)', () => {
    test('por categoría: conteos, retraso, tiempos promedio y cumplimiento del SLA', async () => {
      const res = await call(u.admin, 'get', `${JAN}&id_dependencia=${ids.depA}`);
      expect(res.status).toBe(200);
      expect(res.body.data.periodo).toEqual({ desde: '2026-01-01', hasta: '2026-01-31', por_defecto: false });
      expect(res.body.data.criterio).toBe('Solicitudes registradas entre 01/01/2026 y 31/01/2026; todas las solicitudes del sistema');
      expect(res.body.data.filas).toHaveLength(1);
      expect(res.body.data.filas[0]).toEqual({
        id_categoria: ids.catA, categoria: `Cat A ${sufijo}`,
        total: 5, pendientes: 2, en_proceso: 1, resueltas: 1, cerradas: 1, rechazadas: 0,
        abiertas: 3, con_retraso: 3,
        tiempo_atencion_horas: 15, // (10 + 30 + 5) / 3: la ASIGNADA aún no inicia
        tiempo_resolucion_horas: 35, // (20 + 50) / 2
        cumplimiento_sla: 50, // 1 de 2 resueltas dentro de 24 h
      });
    });

    test('la solicitud registrada el 31 de enero 22:00 (Bogotá) cuenta en enero, no en febrero', async () => {
      const jan = await call(u.admin, 'get', `/api/reports/by-status?desde=2026-01-01&hasta=2026-01-31&id_dependencia=${ids.depA}`);
      expect(jan.body.data.filas.find((f) => f.estado === 'ASIGNADA').total).toBe(1);
      const feb = await call(u.admin, 'get', `/api/reports/by-status?desde=2026-02-01&hasta=2026-02-28&id_dependencia=${ids.depA}`);
      expect(feb.body.data.filas.find((f) => f.estado === 'ASIGNADA').total).toBe(0);
    });

    test('por estado: siempre los 7 estados, con ceros', async () => {
      const res = await call(u.admin, 'get', `/api/reports/by-status?desde=2026-01-01&hasta=2026-01-31&id_dependencia=${ids.depA}`);
      expect(res.body.data.filas).toEqual([
        { estado: 'REGISTRADA', total: 1 }, { estado: 'ASIGNADA', total: 1 }, { estado: 'EN_PROCESO', total: 1 },
        { estado: 'RESUELTA', total: 1 }, { estado: 'CERRADA', total: 1 }, { estado: 'RECHAZADA', total: 0 }, { estado: 'REABIERTA', total: 0 },
      ]);
    });

    test('por dependencia (sin filtrar): aparecen A y B con sus cifras', async () => {
      const res = await call(u.admin, 'get', '/api/reports/by-dependency?desde=2026-01-01&hasta=2026-01-31');
      const byName = Object.fromEntries(res.body.data.filas.map((f) => [f.dependencia, f]));
      expect(byName[`Rep A ${sufijo}`].total).toBe(5);
      expect(byName[`Rep B ${sufijo}`]).toEqual(expect.objectContaining({ total: 1, pendientes: 1, tiempo_atencion_horas: null, tiempo_resolucion_horas: null, cumplimiento_sla: null }));
      expect(byName[`Rep C ${sufijo}`]).toBeUndefined(); // marzo
    });

    test('por periodo: meses sin datos salen en cero y por defecto son los últimos 6 meses', async () => {
      const res = await call(u.admin, 'get', `/api/reports/by-period?desde=2026-01-01&hasta=2026-03-31&id_dependencia=${ids.depA}`);
      expect(res.body.data.filas).toEqual([
        { periodo: '2026-01', total: 5, resueltas: 2, rechazadas: 0 },
        { periodo: '2026-02', total: 1, resueltas: 0, rechazadas: 1 },
        { periodo: '2026-03', total: 0, resueltas: 0, rechazadas: 0 },
      ]);
      const def = await call(u.admin, 'get', '/api/reports/by-period');
      expect(def.body.data.periodo.por_defecto).toBe(true);
      expect(def.body.data.filas).toHaveLength(6);
    });

    test('filtro por categoría y fecha inicial sin final', async () => {
      const res = await call(u.admin, 'get', `/api/reports/by-dependency?desde=2026-01-01&hasta=2026-01-31&id_categoria=${ids.catB}`);
      expect(res.body.data.filas.map((f) => f.dependencia)).toEqual([`Rep B ${sufijo}`]);
    });
  });

  describe('alcance por perfil', () => {
    test('supervisor: solo sus dependencias; filtrar otra dependencia no filtra nada ajeno', async () => {
      const a = await call(u.sup, 'get', '/api/reports/by-dependency?desde=2026-01-01&hasta=2026-01-31');
      expect(a.body.data.filas.map((f) => f.dependencia)).toEqual([`Rep A ${sufijo}`]);
      expect(a.body.data.ambito).toBe('solicitudes de las dependencias que supervisas');
      const other = await call(u.sup, 'get', `/api/reports/by-dependency?desde=2026-01-01&hasta=2026-01-31&id_dependencia=${ids.depB}`);
      expect(other.body.data.filas).toEqual([]);
      const b = await call(u.supB, 'get', '/api/reports/by-dependency?desde=2026-01-01&hasta=2026-01-31');
      expect(b.body.data.filas.map((f) => f.dependencia)).toEqual([`Rep B ${sufijo}`]);
    });

    test('funcionario: solo sus propias cifras (última asignación suya)', async () => {
      const one = await call(u.func, 'get', '/api/reports/by-dependency?desde=2026-01-01&hasta=2026-01-31');
      expect(one.body.data.filas).toHaveLength(1);
      expect(one.body.data.filas[0]).toEqual(expect.objectContaining({ total: 3, cerradas: 1, resueltas: 1, en_proceso: 1 }));
      expect(one.body.data.ambito).toBe('solicitudes asignadas a ti');
      const two = await call(u.func2, 'get', '/api/reports/by-dependency?desde=2026-01-01&hasta=2026-01-31');
      expect(two.body.data.filas[0]).toEqual(expect.objectContaining({ total: 1, pendientes: 1 }));
    });

    test('dashboard: el estudiante solo ve lo suyo; otro estudiante, ceros y sin promedios', async () => {
      const mine = await call(u.est, 'get', '/api/dashboard?desde=2026-01-01&hasta=2026-01-31');
      expect(mine.status).toBe(200);
      expect(mine.body.data.ambito).toBe('tus solicitudes');
      expect(mine.body.data.indicadores.total).toBe(6); // 5 de la dependencia A + 1 de B en enero
      const other = await call(u.est2, 'get', '/api/dashboard?desde=2026-01-01&hasta=2026-01-31');
      expect(other.body.data.indicadores).toEqual(expect.objectContaining({
        total: 0, abiertas: 0, con_retraso: 0, tiempo_atencion_horas: null, tiempo_resolucion_horas: null, cumplimiento_sla: null,
      }));
    });

    test('dashboard sin fechas: mes en curso marcado como por defecto', async () => {
      const res = await call(u.est2, 'get', '/api/dashboard');
      expect(res.body.data.periodo.por_defecto).toBe(true);
      expect(res.body.data.periodo.desde).toMatch(/^\d{4}-\d{2}-01$/);
      expect(res.body.data.criterio).toMatch(/^Solicitudes registradas entre 01\/\d{2}\/\d{4} y \d{2}\/\d{2}\/\d{4}; tus solicitudes$/);
    });

    test('dashboard del supervisor y el administrador usan su alcance', async () => {
      const admin = await call(u.admin, 'get', `/api/dashboard?desde=2026-01-01&hasta=2026-01-31&id_dependencia=${ids.depA}`);
      expect(admin.body.data.indicadores.total).toBe(5);
      expect(admin.body.data.indicadores.cumplimiento_sla).toBe(50);
      const sup = await call(u.sup, 'get', '/api/dashboard?desde=2026-01-01&hasta=2026-01-31');
      expect(sup.body.data.indicadores.total).toBe(5);
      const supB = await call(u.supB, 'get', '/api/dashboard?desde=2026-01-01&hasta=2026-01-31');
      expect(supB.body.data.indicadores.total).toBe(1);
    });
  });

  describe('exportación CSV', () => {
    test('descarga con periodo y criterio, y neutraliza nombres que parecen fórmulas', async () => {
      const res = await call(u.admin, 'get', `/api/reports/by-category?desde=2026-03-01&hasta=2026-03-31&id_dependencia=${ids.depC}&formato=csv`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toBe('attachment; filename="solicitudes-por-categoria_2026-03-01_2026-03-31.csv"');
      expect(res.text.startsWith('\uFEFF')).toBe(true);
      expect(res.text.startsWith('\uFEFF\uFEFF')).toBe(false); // un solo BOM
      const text = res.text.replace(/^\uFEFF/, '');
      const lines = text.trim().split('\r\n');
      expect(lines[0]).toBe('Solicitudes registradas entre 01/03/2026 y 31/03/2026; todas las solicitudes del sistema');
      expect(lines[1]).toMatch(/^Categoría,Total,Pendientes/);
      expect(lines[2].startsWith(`'=Cat C ${sufijo},1,1,`)).toBe(true);
    });

    test('el CSV también respeta el alcance y los permisos', async () => {
      expect((await call(u.est, 'get', '/api/reports/by-status?formato=csv')).status).toBe(403);
      const res = await call(u.supB, 'get', '/api/reports/by-dependency?desde=2026-01-01&hasta=2026-01-31&formato=csv');
      expect(res.text).toContain(`Rep B ${sufijo}`);
      expect(res.text).not.toContain(`Rep A ${sufijo}`);
    });
  });
});
