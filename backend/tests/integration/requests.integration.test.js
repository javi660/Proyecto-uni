'use strict';

const request = require('supertest');

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);

describeDb('Solicitudes y adjuntos con PostgreSQL real', () => {
  const PASSWORD = 'Valida12345';
  const sufijo = Date.now().toString(36);
  let app;
  let query;
  let closePool;
  let storage;
  let spyStorage;
  const u = {}; // usuarios con sesión: { agent, csrf, id }
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

  const upload = (who, idSolicitud, buffer, filename, contentType) =>
    who.agent.post(`/api/requests/${idSolicitud}/attachments`).set('X-CSRF-Token', who.csrf).attach('archivo', buffer, { filename, contentType });

  const newRequest = async (who = u.est1, over = {}) => {
    const res = await call(who, 'post', '/api/requests', { id_servicio: ids.servicio, asunto: `Asunto ${Math.random()}`, descripcion: 'Descripción de prueba', ...over });
    expect(res.status).toBe(201);
    return res.body.data;
  };

  /** Simula la asignación (Fase 7 la implementará por API). */
  async function assign(idSolicitud, idFuncionario) {
    await query('INSERT INTO asignaciones (id_solicitud, id_funcionario, id_asignador) VALUES ($1, $2, $3)', [idSolicitud, idFuncionario, ids.admin]);
    await query("UPDATE solicitudes SET estado = 'ASIGNADA' WHERE id_solicitud = $1", [idSolicitud]);
  }

  beforeAll(async () => {
    const { createApp } = require('../../src/app');
    ({ query, closePool } = require('../../src/config/database'));
    storage = require('../../src/services/storage.service');
    spyStorage = storage.createMemoryDriver();
    storage.setDriverForTests(spyStorage);
    const userRepository = require('../../src/repositories/user.repository');
    const { hashPassword } = require('../../src/utils/password');
    app = createApp();
    const hash = await hashPassword(PASSWORD);
    const mk = async (rol, key, idDependencia = null) => {
      const created = await userRepository.create({
        nombres: key, apellidos: 'Prueba', correo: `${key}-${sufijo}@prueba.edu`, passwordHash: hash,
        rol, idDependencia, debeCambiarPassword: false,
      });
      return created.id_usuario;
    };

    ids.admin = await mk('ADMINISTRADOR', 'adm');
    u.admin = await login(`adm-${sufijo}@prueba.edu`);

    const dep = await call(u.admin, 'post', '/api/dependencies', { nombre: `Dep Sol ${sufijo}` });
    const dep2 = await call(u.admin, 'post', '/api/dependencies', { nombre: `Dep Otra ${sufijo}` });
    ids.dep = dep.body.data.id_dependencia;
    ids.dep2 = dep2.body.data.id_dependencia;
    const cat = await call(u.admin, 'post', '/api/categories', { nombre: `Cat Sol ${sufijo}` });
    ids.cat = cat.body.data.id_categoria;
    const sv = await call(u.admin, 'post', '/api/services', { nombre: `Servicio ${sufijo}`, id_categoria: ids.cat, id_dependencia: ids.dep });
    ids.servicio = sv.body.data.id_servicio;
    const sv2 = await call(u.admin, 'post', '/api/services', { nombre: `Servicio inactivo ${sufijo}`, id_categoria: ids.cat, id_dependencia: ids.dep });
    ids.servicioInactivo = sv2.body.data.id_servicio;
    await call(u.admin, 'patch', `/api/services/${ids.servicioInactivo}/status`, { activo: false });

    ids.est1 = await mk('ESTUDIANTE', 'est1');
    ids.est2 = await mk('ESTUDIANTE', 'est2');
    ids.func = await mk('FUNCIONARIO', 'func', ids.dep);
    ids.func2 = await mk('FUNCIONARIO', 'func2', ids.dep2);
    ids.sup = await mk('SUPERVISOR', 'sup');
    ids.sup2 = await mk('SUPERVISOR', 'sup2');
    await query('INSERT INTO supervision_dependencia (id_supervisor, id_dependencia) VALUES ($1, $2)', [ids.sup, ids.dep]);
    await query('INSERT INTO supervision_dependencia (id_supervisor, id_dependencia) VALUES ($1, $2)', [ids.sup2, ids.dep2]);

    for (const key of ['est1', 'est2', 'func', 'func2', 'sup', 'sup2']) u[key] = await login(`${key}-${sufijo}@prueba.edu`);
  });

  afterAll(async () => {
    if (closePool) await closePool();
  });

  describe('registro de solicitudes', () => {
    test('el estudiante registra: código, estado REGISTRADA, prioridad NORMAL, propietario y historial inicial', async () => {
      const res = await call(u.est1, 'post', '/api/requests', { id_servicio: ids.servicio, asunto: '  Certificado   de notas ', descripcion: ' Lo necesito para una beca ' });
      expect(res.status).toBe(201);
      const data = res.body.data;
      expect(data).toMatchObject({
        estado: 'REGISTRADA', prioridad: 'NORMAL', asunto: 'Certificado de notas', descripcion: 'Lo necesito para una beca',
        id_estudiante: ids.est1, id_servicio: ids.servicio, id_dependencia: ids.dep, total_adjuntos: 0, adjuntos: [], funcionario: null,
      });
      expect(data.codigo).toMatch(/^SGSSU-\d{4}-\d{6,}$/);

      const { rows: hist } = await query('SELECT estado_anterior, estado_nuevo, id_usuario FROM historial_estados WHERE id_solicitud = $1', [data.id_solicitud]);
      expect(hist).toEqual([{ estado_anterior: null, estado_nuevo: 'REGISTRADA', id_usuario: ids.est1 }]);
      const { rows: aud } = await query("SELECT resultado FROM auditoria WHERE operacion = 'SOLICITUD_CREADA' AND id_recurso = $1", [String(data.id_solicitud)]);
      expect(aud).toHaveLength(1);
    });

    test('los códigos son consecutivos y distintos', async () => {
      const [a, b] = [await newRequest(), await newRequest()];
      expect(a.codigo).not.toBe(b.codigo);
    });

    test.each([
      ['estado', { estado: 'CERRADA' }],
      ['propietario', { id_estudiante: 1 }],
      ['prioridad', { prioridad: 'URGENTE' }],
    ])('el cliente no puede fijar %s => 400', async (_n, extra) => {
      const res = await call(u.est1, 'post', '/api/requests', { id_servicio: ids.servicio, asunto: 'x', descripcion: 'y', ...extra });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('asunto vacío => 400; servicio inexistente => 404; servicio inactivo => 409', async () => {
      expect((await call(u.est1, 'post', '/api/requests', { id_servicio: ids.servicio, asunto: '  ', descripcion: 'y' })).status).toBe(400);
      expect((await call(u.est1, 'post', '/api/requests', { id_servicio: 999999999, asunto: 'x', descripcion: 'y' })).status).toBe(404);
      const inactive = await call(u.est1, 'post', '/api/requests', { id_servicio: ids.servicioInactivo, asunto: 'x', descripcion: 'y' });
      expect(inactive.status).toBe(409);
      expect(inactive.body.error.code).toBe('SERVICE_INACTIVE');
    });

    test.each(['admin', 'func', 'sup'])('el perfil %s no puede registrar => 403', async (who) => {
      const res = await call(u[who], 'post', '/api/requests', { id_servicio: ids.servicio, asunto: 'x', descripcion: 'y' });
      expect(res.status).toBe(403);
    });

    test('sin sesión => 401 y sin token CSRF => 403', async () => {
      const anon = request.agent(app);
      const csrf = (await anon.get('/api/auth/csrf')).body.data.csrf_token;
      expect((await anon.post('/api/requests').set('X-CSRF-Token', csrf).send({})).status).toBe(401);
      const res = await u.est1.agent.post('/api/requests').send({ id_servicio: ids.servicio, asunto: 'x', descripcion: 'y' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });
  });

  describe('consulta y alcance por perfil', () => {
    let own; // solicitud de est1 asignada a func (dependencia dep)

    beforeAll(async () => {
      own = await newRequest(u.est1, { asunto: 'Alcance principal' });
      ids.otraEst2 = (await newRequest(u.est2, { asunto: 'De la otra estudiante' })).id_solicitud;
    });

    test('estudiante: solo ve las suyas (listado, /my y detalle)', async () => {
      const mine = await call(u.est1, 'get', '/api/requests/my?pageSize=100');
      expect(mine.status).toBe(200);
      expect(mine.body.data.every((r) => r.id_estudiante === ids.est1)).toBe(true);
      expect(mine.body.data.map((r) => r.id_solicitud)).toContain(own.id_solicitud);

      const all = await call(u.est1, 'get', '/api/requests?pageSize=100');
      expect(all.body.data.every((r) => r.id_estudiante === ids.est1)).toBe(true);

      expect((await call(u.est1, 'get', `/api/requests/${own.id_solicitud}`)).status).toBe(200);
      const foreign = await call(u.est1, 'get', `/api/requests/${ids.otraEst2}`);
      expect(foreign.status).toBe(404); // no revela que existe
      expect(foreign.body.error.code).toBe('NOT_FOUND');
    });

    test('/my es solo para el estudiante', async () => {
      expect((await call(u.admin, 'get', '/api/requests/my')).status).toBe(403);
      expect((await call(u.func, 'get', '/api/requests/my')).status).toBe(403);
    });

    test('administrador: ve todas', async () => {
      const res = await call(u.admin, 'get', `/api/requests?q=${encodeURIComponent('Alcance principal')}`);
      expect(res.body.data.map((r) => r.id_solicitud)).toContain(own.id_solicitud);
      expect((await call(u.admin, 'get', `/api/requests/${ids.otraEst2}`)).status).toBe(200);
    });

    test('funcionario: solo las asignadas a él (y tras reasignar pierde el acceso)', async () => {
      expect((await call(u.func, 'get', `/api/requests/${own.id_solicitud}`)).status).toBe(404);
      expect((await call(u.func, 'get', '/api/requests?pageSize=100')).body.data).toEqual([]);

      await assign(own.id_solicitud, ids.func);
      const detail = await call(u.func, 'get', `/api/requests/${own.id_solicitud}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({ estado: 'ASIGNADA', id_funcionario: ids.func });
      expect((await call(u.func, 'get', '/api/requests?pageSize=100')).body.data.map((r) => r.id_solicitud)).toEqual([own.id_solicitud]);

      // otro funcionario no la ve
      expect((await call(u.func2, 'get', `/api/requests/${own.id_solicitud}`)).status).toBe(404);
    });

    test('supervisor: solo las de las dependencias que supervisa', async () => {
      expect((await call(u.sup, 'get', `/api/requests/${own.id_solicitud}`)).status).toBe(200);
      expect((await call(u.sup2, 'get', `/api/requests/${own.id_solicitud}`)).status).toBe(404);
      const list = await call(u.sup2, 'get', '/api/requests?pageSize=100');
      expect(list.body.data.map((r) => r.id_solicitud)).not.toContain(own.id_solicitud);
    });

    test('filtros: estado, texto, servicio, dependencia, fechas y paginación', async () => {
      const byState = await call(u.admin, 'get', '/api/requests?estado=ASIGNADA&pageSize=100');
      expect(byState.body.data.length).toBeGreaterThan(0);
      expect(byState.body.data.every((r) => r.estado === 'ASIGNADA')).toBe(true);

      const byCode = await call(u.admin, 'get', `/api/requests?q=${own.codigo}`);
      expect(byCode.body.data.map((r) => r.codigo)).toEqual([own.codigo]);

      expect((await call(u.admin, 'get', `/api/requests?id_dependencia=${ids.dep2}`)).body.data).toEqual([]);
      expect((await call(u.admin, 'get', `/api/requests?id_servicio=${ids.servicio}&pageSize=100`)).body.data.length).toBeGreaterThan(0);

      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
      const inRange = await call(u.admin, 'get', `/api/requests?desde=${today}&hasta=${today}&pageSize=100`);
      expect(inRange.body.data.map((r) => r.id_solicitud)).toContain(own.id_solicitud);
      expect((await call(u.admin, 'get', '/api/requests?hasta=2000-01-01')).body.data).toEqual([]);

      const page = await call(u.admin, 'get', '/api/requests?page=1&pageSize=2');
      expect(page.body.data).toHaveLength(2);
      expect(page.body.meta).toMatchObject({ page: 1, pageSize: 2 });
      expect(page.body.meta.total).toBeGreaterThan(2);
      const dates = page.body.data.map((r) => r.fecha_registro);
      expect(dates[0] >= dates[1]).toBe(true); // más recientes primero
    });

    test('búsqueda con comodines SQL se trata como texto literal', async () => {
      const res = await call(u.admin, 'get', `/api/requests?q=${encodeURIComponent('%')}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    test('filtros inválidos => 400; id inválido => 400; inexistente => 404', async () => {
      expect((await call(u.admin, 'get', '/api/requests?estado=XX')).status).toBe(400);
      expect((await call(u.admin, 'get', '/api/requests?desde=2026-05-02&hasta=2026-05-01')).status).toBe(400);
      expect((await call(u.admin, 'get', '/api/requests/abc')).status).toBe(400);
      expect((await call(u.admin, 'get', '/api/requests/999999999')).status).toBe(404);
    });

    test('la respuesta no expone datos internos', async () => {
      const res = await call(u.admin, 'get', `/api/requests/${own.id_solicitud}`);
      expect(JSON.stringify(res.body)).not.toMatch(/password_hash|ruta_archivo|nombre_almacenado/);
    });
  });

  describe('adjuntos', () => {
    let req;

    beforeAll(async () => {
      req = await newRequest(u.est1, { asunto: 'Con adjuntos' });
    });

    test('estudiante propietario sube PDF: metadatos sin ruta interna, objeto en Storage, auditoría', async () => {
      const res = await upload(u.est1, req.id_solicitud, PDF, 'Acta de notas.pdf', 'application/pdf');
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        id_solicitud: req.id_solicitud, nombre_original: 'Acta de notas.pdf', tipo_mime: 'application/pdf', tamano_bytes: PDF.length, id_usuario: ids.est1,
      });
      expect(res.body.data).not.toHaveProperty('ruta_archivo');
      ids.adjunto = res.body.data.id_adjunto;

      const { rows } = await query('SELECT ruta_archivo, nombre_almacenado FROM adjuntos WHERE id_adjunto = $1', [ids.adjunto]);
      expect(rows[0].ruta_archivo).toMatch(new RegExp(`^solicitudes/${req.id_solicitud}/[0-9a-f-]{36}\\.pdf$`));
      expect(rows[0].nombre_almacenado).not.toContain('Acta');
      expect(spyStorage._objects.has(rows[0].ruta_archivo)).toBe(true);

      const { rows: aud } = await query("SELECT 1 FROM auditoria WHERE operacion = 'ADJUNTO_SUBIDO' AND id_recurso = $1", [String(ids.adjunto)]);
      expect(aud).toHaveLength(1);
    });

    test('el nombre original con rutas se sanea y no controla la ruta de almacenamiento', async () => {
      const res = await upload(u.est1, req.id_solicitud, PNG, '../../etc/pasaporte.png', 'image/png');
      expect(res.status).toBe(201);
      expect(res.body.data.nombre_original).toBe('pasaporte.png');
    });

    test('lista de adjuntos y total en el detalle', async () => {
      const list = await call(u.est1, 'get', `/api/requests/${req.id_solicitud}/attachments`);
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(2);
      const detail = await call(u.admin, 'get', `/api/requests/${req.id_solicitud}`);
      expect(detail.body.data.total_adjuntos).toBe(2);
      expect(detail.body.data.adjuntos).toHaveLength(2);
    });

    test.each([
      ['ejecutable renombrado a PDF', EXE, 'inocente.pdf', 'application/pdf', 400, 'FILE_CONTENT_MISMATCH'],
      ['extensión .exe', EXE, 'virus.exe', 'application/x-msdownload', 415, 'FILE_TYPE_NOT_ALLOWED'],
      ['PNG con extensión PDF', PNG, 'foto.pdf', 'application/pdf', 400, 'FILE_CONTENT_MISMATCH'],
      ['MIME declarado distinto', PDF, 'doc.pdf', 'image/png', 400, 'FILE_CONTENT_MISMATCH'],
    ])('rechaza %s', async (_n, buffer, filename, contentType, status, code) => {
      const fresh = await newRequest(u.est1);
      const res = await upload(u.est1, fresh.id_solicitud, buffer, filename, contentType);
      expect(res.status).toBe(status);
      expect(res.body.error.code).toBe(code);
      const { rows } = await query('SELECT COUNT(*)::int AS n FROM adjuntos WHERE id_solicitud = $1', [fresh.id_solicitud]);
      expect(rows[0].n).toBe(0);
    });

    test('archivo mayor de 5 MB => 413 y sin archivo => 400', async () => {
      const fresh = await newRequest(u.est1);
      const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
      const tooBig = await upload(u.est1, fresh.id_solicitud, big, 'grande.pdf', 'application/pdf');
      expect(tooBig.status).toBe(413);
      expect(tooBig.body.error.code).toBe('FILE_TOO_LARGE');

      const none = await u.est1.agent.post(`/api/requests/${fresh.id_solicitud}/attachments`).set('X-CSRF-Token', u.est1.csrf).send({});
      expect(none.status).toBe(400);
      expect(none.body.error.code).toBe('FILE_REQUIRED');
    });

    test('máximo 3 adjuntos por solicitud', async () => {
      const fresh = await newRequest(u.est1);
      for (let i = 0; i < 3; i += 1) {
        expect((await upload(u.est1, fresh.id_solicitud, PDF, `a${i}.pdf`, 'application/pdf')).status).toBe(201);
      }
      const fourth = await upload(u.est1, fresh.id_solicitud, PDF, 'a4.pdf', 'application/pdf');
      expect(fourth.status).toBe(409);
      expect(fourth.body.error.code).toBe('ATTACHMENT_LIMIT');
    });

    test('subidas simultáneas no superan el límite ni dejan archivos huérfanos', async () => {
      const fresh = await newRequest(u.est1);
      const results = await Promise.all(
        Array.from({ length: 5 }, (_v, i) => upload(u.est1, fresh.id_solicitud, PDF, `c${i}.pdf`, 'application/pdf')),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(3);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
      const { rows } = await query('SELECT ruta_archivo FROM adjuntos WHERE id_solicitud = $1', [fresh.id_solicitud]);
      expect(rows).toHaveLength(3);
      const stored = [...spyStorage._objects.keys()].filter((k) => k.startsWith(`solicitudes/${fresh.id_solicitud}/`));
      expect(stored.sort()).toEqual(rows.map((r) => r.ruta_archivo).sort());
    });

    test('quién puede subir: otro estudiante 404; administrador y supervisor 403; funcionario no asignado 404', async () => {
      const fresh = await newRequest(u.est1);
      expect((await upload(u.est2, fresh.id_solicitud, PDF, 'x.pdf', 'application/pdf')).status).toBe(404);
      expect((await upload(u.admin, fresh.id_solicitud, PDF, 'x.pdf', 'application/pdf')).status).toBe(403);
      expect((await upload(u.sup, fresh.id_solicitud, PDF, 'x.pdf', 'application/pdf')).status).toBe(403);
      expect((await upload(u.func, fresh.id_solicitud, PDF, 'x.pdf', 'application/pdf')).status).toBe(404);
    });

    test('el funcionario asignado puede subir; el de otra dependencia no', async () => {
      const fresh = await newRequest(u.est1);
      await assign(fresh.id_solicitud, ids.func);
      const ok = await upload(u.func, fresh.id_solicitud, PNG, 'evidencia.png', 'image/png');
      expect(ok.status).toBe(201);
      expect(ok.body.data.id_usuario).toBe(ids.func);
      expect((await upload(u.func2, fresh.id_solicitud, PNG, 'x.png', 'image/png')).status).toBe(404);
    });

    test.each(['RECHAZADA', 'CERRADA'])('solicitud %s no admite adjuntos => 409', async (estado) => {
      const fresh = await newRequest(u.est1);
      if (estado === 'RECHAZADA') {
        await query("UPDATE solicitudes SET estado = 'RECHAZADA' WHERE id_solicitud = $1", [fresh.id_solicitud]);
      } else {
        await assign(fresh.id_solicitud, ids.func);
        await query("UPDATE solicitudes SET estado = 'EN_PROCESO' WHERE id_solicitud = $1", [fresh.id_solicitud]);
        await query("UPDATE solicitudes SET estado = 'RESUELTA', fecha_resolucion = NOW() WHERE id_solicitud = $1", [fresh.id_solicitud]);
        await query("UPDATE asignaciones SET activo = FALSE, finalizado_en = NOW() WHERE id_solicitud = $1", [fresh.id_solicitud]);
        await query("UPDATE solicitudes SET estado = 'CERRADA', fecha_cierre = NOW() WHERE id_solicitud = $1", [fresh.id_solicitud]);
      }
      const res = await upload(u.est1, fresh.id_solicitud, PDF, 'tarde.pdf', 'application/pdf');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('REQUEST_CLOSED');
    });

    test('descarga: propietario, administrador, supervisor del ámbito y funcionario asignado; cabeceras seguras', async () => {
      const res = await u.est1.agent.get(`/api/attachments/${ids.adjunto}/download`).buffer(true).parse((r, cb) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(res.status).toBe(200);
      expect(Buffer.compare(res.body, PDF)).toBe(0);
      expect(res.headers['content-type']).toMatch(/^application\/pdf/);
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="Acta de notas\.pdf"/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toMatch(/no-store/);

      expect((await call(u.admin, 'get', `/api/attachments/${ids.adjunto}/download`)).status).toBe(200);
      expect((await call(u.sup, 'get', `/api/attachments/${ids.adjunto}/download`)).status).toBe(200);
      const { rows: aud } = await query("SELECT 1 FROM auditoria WHERE operacion = 'ADJUNTO_DESCARGADO' AND id_recurso = $1", [String(ids.adjunto)]);
      expect(aud.length).toBeGreaterThanOrEqual(3);
    });

    test('descarga fuera de alcance => 404; sin sesión => 401; id inválido => 400', async () => {
      expect((await call(u.est2, 'get', `/api/attachments/${ids.adjunto}/download`)).status).toBe(404);
      expect((await call(u.sup2, 'get', `/api/attachments/${ids.adjunto}/download`)).status).toBe(404);
      expect((await call(u.func, 'get', `/api/attachments/${ids.adjunto}/download`)).status).toBe(404);
      expect((await request(app).get(`/api/attachments/${ids.adjunto}/download`)).status).toBe(401);
      expect((await call(u.admin, 'get', '/api/attachments/xyz/download')).status).toBe(400);
      expect((await call(u.admin, 'get', '/api/attachments/999999999/download')).status).toBe(404);
    });

    test('si el objeto ya no está en Storage => 404 con mensaje claro', async () => {
      const { rows } = await query('SELECT ruta_archivo FROM adjuntos WHERE id_adjunto = $1', [ids.adjunto]);
      const backup = spyStorage._objects.get(rows[0].ruta_archivo);
      spyStorage._objects.delete(rows[0].ruta_archivo);
      const res = await call(u.admin, 'get', `/api/attachments/${ids.adjunto}/download`);
      expect(res.status).toBe(404);
      expect(res.body.error.message).toMatch(/ya no está disponible/);
      spyStorage._objects.set(rows[0].ruta_archivo, backup);
    });

    test('si falla la base de datos tras subir al Storage, el objeto se elimina (sin huérfanos)', async () => {
      const fresh = await newRequest(u.est1);
      const before = spyStorage._objects.size;
      // Fuerza el fallo del INSERT: nombre original que viola la restricción de la tabla
      const repo = require('../../src/repositories/request.repository');
      const original = repo.insertAttachment;
      repo.insertAttachment = async () => { throw Object.assign(new Error('boom'), { code: '23514' }); };
      try {
        const res = await upload(u.est1, fresh.id_solicitud, PDF, 'falla.pdf', 'application/pdf');
        expect(res.status).toBe(422);
      } finally {
        repo.insertAttachment = original;
      }
      expect(spyStorage._objects.size).toBe(before);
    });
  });
});
