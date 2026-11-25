'use strict';

const request = require('supertest');

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

describeDb('API de administración con PostgreSQL real', () => {
  const PASSWORD = 'Valida12345';
  let app;
  let query;
  let closePool;
  let admin; // { agent, csrf, id }
  let ids = {};

  const sufijo = Date.now().toString(36); // evita choques de nombres entre ejecuciones

  async function csrfFor(agent) {
    return (await agent.get('/api/auth/csrf')).body.data.csrf_token;
  }

  async function loginAs(correo, password = PASSWORD) {
    const agent = request.agent(app);
    const csrf = await csrfFor(agent);
    const res = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ correo, password });
    return { agent, csrf, res };
  }

  /** Atajo para llamar como administrador. */
  const api = (method, url, body) => {
    let req = admin.agent[method](url);
    if (method !== 'get') req = req.set('X-CSRF-Token', admin.csrf).send(body ?? {});
    return req;
  };

  const newUser = (over = {}) => ({
    nombres: 'Nuevo', apellidos: 'Usuario', correo: `u-${Math.random().toString(36).slice(2)}@prueba.edu`,
    rol: 'ESTUDIANTE', password_inicial: PASSWORD, ...over,
  });

  beforeAll(async () => {
    const { createApp } = require('../../src/app');
    ({ query, closePool } = require('../../src/config/database'));
    const userRepository = require('../../src/repositories/user.repository');
    const { hashPassword } = require('../../src/utils/password');
    app = createApp();

    const hash = await hashPassword(PASSWORD);
    const first = await userRepository.create({
      nombres: 'Root', apellidos: 'Admin', correo: `root-${sufijo}@prueba.edu`, passwordHash: hash,
      rol: 'ADMINISTRADOR', idDependencia: null, debeCambiarPassword: false,
    });
    const { agent, csrf, res } = await loginAs(`root-${sufijo}@prueba.edu`);
    expect(res.status).toBe(200);
    admin = { agent, csrf, id: first.id_usuario };
  });

  afterAll(async () => {
    if (closePool) await closePool();
  });

  describe('dependencias, categorías y servicios', () => {
    test('crear dependencia y categoría; nombre duplicado (sin distinguir mayúsculas) => 409', async () => {
      const dep = await api('post', '/api/dependencies', { nombre: `  Registro   ${sufijo} `, descripcion: 'Trámites académicos' });
      expect(dep.status).toBe(201);
      expect(dep.body.data.nombre).toBe(`Registro ${sufijo}`); // espacios normalizados
      ids.dep = dep.body.data.id_dependencia;

      const dup = await api('post', '/api/dependencies', { nombre: `REGISTRO ${sufijo}` });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('DUPLICATE_NAME');

      const cat = await api('post', '/api/categories', { nombre: `Académico ${sufijo}` });
      expect(cat.status).toBe(201);
      ids.cat = cat.body.data.id_categoria;
      expect((await api('post', '/api/categories', { nombre: `académico ${sufijo}` })).status).toBe(409);
    });

    test('crear servicio con SLA por defecto de 72 h; duplicado en la categoría => 409', async () => {
      const res = await api('post', '/api/services', { nombre: `Certificado ${sufijo}`, id_categoria: ids.cat, id_dependencia: ids.dep });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ sla_horas: 72, categoria: `Académico ${sufijo}`, dependencia: `Registro ${sufijo}`, activo: true });
      ids.srv = res.body.data.id_servicio;

      const dup = await api('post', '/api/services', { nombre: `CERTIFICADO ${sufijo}`, id_categoria: ids.cat, id_dependencia: ids.dep });
      expect(dup.status).toBe(409);
    });

    test('servicio con categoría o dependencia inexistente => 422', async () => {
      const a = await api('post', '/api/services', { nombre: 'X', id_categoria: 99999999, id_dependencia: ids.dep });
      const b = await api('post', '/api/services', { nombre: 'X', id_categoria: ids.cat, id_dependencia: 99999999 });
      expect(a.status).toBe(422);
      expect(a.body.error.code).toBe('INVALID_CATEGORY');
      expect(b.body.error.code).toBe('INVALID_DEPENDENCY');
    });

    test('editar con PUT, y 404 si no existe', async () => {
      const res = await api('put', `/api/services/${ids.srv}`, { nombre: `Certificado de notas ${sufijo}`, descripcion: 'PDF firmado', id_categoria: ids.cat, id_dependencia: ids.dep, sla_horas: 48 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ sla_horas: 48, descripcion: 'PDF firmado' });
      expect((await api('put', '/api/services/99999999', { nombre: 'X', id_categoria: ids.cat, id_dependencia: ids.dep })).status).toBe(404);
      expect((await api('patch', '/api/dependencies/99999999/status', { activo: false })).status).toBe(404);
    });

    test('no se desactiva una dependencia ni una categoría con servicios activos (409 con conteo)', async () => {
      const dep = await api('patch', `/api/dependencies/${ids.dep}/status`, { activo: false });
      expect(dep.status).toBe(409);
      expect(dep.body.error.code).toBe('HAS_ACTIVE_DEPENDENTS');
      expect(dep.body.error.details[0]).toMatchObject({ servicios_activos: 1 });

      const cat = await api('patch', `/api/categories/${ids.cat}/status`, { activo: false });
      expect(cat.status).toBe(409);
    });

    test('desactivar el servicio permite desactivar categoría y dependencia; activar el servicio con padres inactivos => 422', async () => {
      expect((await api('patch', `/api/services/${ids.srv}/status`, { activo: false })).body.data.activo).toBe(false);
      expect((await api('patch', `/api/categories/${ids.cat}/status`, { activo: false })).status).toBe(200);
      expect((await api('patch', `/api/dependencies/${ids.dep}/status`, { activo: false })).status).toBe(200);

      const blocked = await api('patch', `/api/services/${ids.srv}/status`, { activo: true });
      expect(blocked.status).toBe(422);
      expect(['CATEGORY_INACTIVE', 'DEPENDENCY_INACTIVE']).toContain(blocked.body.error.code);

      // Y no se puede crear un servicio sobre una categoría desactivada
      const created = await api('post', '/api/services', { nombre: 'Otro', id_categoria: ids.cat, id_dependencia: ids.dep });
      expect(created.status).toBe(422);

      // Se reactivan para el resto de las pruebas
      await api('patch', `/api/dependencies/${ids.dep}/status`, { activo: true });
      await api('patch', `/api/categories/${ids.cat}/status`, { activo: true });
      expect((await api('patch', `/api/services/${ids.srv}/status`, { activo: true })).body.data.activo).toBe(true);
    });

    test('listados: filtros, búsqueda literal y metadatos de paginación', async () => {
      const list = await api('get', `/api/services?q=${encodeURIComponent(`notas ${sufijo}`)}&id_categoria=${ids.cat}&pageSize=1`);
      expect(list.status).toBe(200);
      expect(list.body.meta).toEqual({ page: 1, pageSize: 1, total: 1 });
      expect(list.body.data).toHaveLength(1);

      // Los comodines de LIKE se tratan como texto: "%" no coincide con todo
      const wild = await api('get', '/api/categories?q=%25');
      expect(wild.body.data.every((c) => (c.nombre + (c.descripcion || '')).includes('%'))).toBe(true);

      // Un intento de inyección simplemente no encuentra nada
      const inj = await api('get', `/api/dependencies?q=${encodeURIComponent("'; DROP TABLE usuarios; --")}`);
      expect(inj.status).toBe(200);
      expect(inj.body.data).toEqual([]);
      expect((await query('SELECT COUNT(*) AS n FROM usuarios')).rows[0].n).toBeGreaterThan(0);
    });

    test('un estudiante solo ve lo activo y no puede gestionar', async () => {
      const est = await api('post', '/api/users', newUser({ correo: `est-cat-${sufijo}@prueba.edu` }));
      expect(est.status).toBe(201);
      const inactiveDep = await api('post', '/api/dependencies', { nombre: `Cerrada ${sufijo}` });
      await api('patch', `/api/dependencies/${inactiveDep.body.data.id_dependencia}/status`, { activo: false });

      // El usuario nuevo debe cambiar su contraseña antes de usar el sistema
      const { agent, csrf } = await loginAs(`est-cat-${sufijo}@prueba.edu`);
      const blocked = await agent.get('/api/dependencies');
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

      await agent.patch('/api/auth/password').set('X-CSRF-Token', csrf).send({ password_actual: PASSWORD, password_nueva: 'Nueva123456' });
      const list = await agent.get('/api/dependencies?pageSize=100');
      expect(list.status).toBe(200);
      expect(list.body.data.every((d) => d.activo)).toBe(true);
      expect(list.body.data.some((d) => d.id_dependencia === inactiveDep.body.data.id_dependencia)).toBe(false);
      expect((await agent.get(`/api/dependencies/${inactiveDep.body.data.id_dependencia}`)).status).toBe(404);
      expect((await agent.post('/api/dependencies').set('X-CSRF-Token', csrf).send({ nombre: 'Intruso' })).status).toBe(403);
    });
  });

  describe('usuarios', () => {
    test('crear usuario: no devuelve password_hash, exige cambio de contraseña y audita sin secretos', async () => {
      const body = newUser({ correo: `Ana.${sufijo}@Prueba.EDU` });
      const res = await api('post', '/api/users', body);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ correo: `ana.${sufijo}@prueba.edu`, rol: 'ESTUDIANTE', activo: true, debe_cambiar_password: true });
      expect(JSON.stringify(res.body)).not.toMatch(/password_hash|\$2[aby]\$/);

      const audit = await query(
        "SELECT detalle::text AS detalle, id_usuario FROM auditoria WHERE operacion = 'USUARIO_CREAR' AND id_recurso = $1",
        [String(res.body.data.id_usuario)],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].id_usuario).toBe(admin.id);
      expect(audit.rows[0].detalle).not.toMatch(new RegExp(PASSWORD));

      const login = await loginAs(`ana.${sufijo}@prueba.edu`);
      expect(login.res.body.data.user.debe_cambiar_password).toBe(true);
    });

    test('correo repetido => 409 DUPLICATE_EMAIL', async () => {
      const body = newUser({ correo: `dup-${sufijo}@prueba.edu` });
      expect((await api('post', '/api/users', body)).status).toBe(201);
      const again = await api('post', '/api/users', { ...body, correo: `DUP-${sufijo}@prueba.edu` });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('DUPLICATE_EMAIL');
    });

    test('reglas perfil–dependencia: funcionario exige dependencia activa; los demás no la llevan', async () => {
      const dep = await api('post', '/api/dependencies', { nombre: `Bienestar ${sufijo}` });
      const idDep = dep.body.data.id_dependencia;

      const sin = await api('post', '/api/users', newUser({ rol: 'FUNCIONARIO' }));
      expect(sin.status).toBe(422);
      expect(sin.body.error.code).toBe('DEPENDENCY_REQUIRED');

      const est = await api('post', '/api/users', newUser({ rol: 'ESTUDIANTE', id_dependencia: idDep }));
      expect(est.body.error.code).toBe('DEPENDENCY_NOT_ALLOWED');

      expect((await api('post', '/api/users', newUser({ rol: 'FUNCIONARIO', id_dependencia: 99999999 }))).body.error.code).toBe('INVALID_DEPENDENCY');

      const ok = await api('post', '/api/users', newUser({ rol: 'FUNCIONARIO', id_dependencia: idDep }));
      expect(ok.status).toBe(201);
      expect(ok.body.data).toMatchObject({ rol: 'FUNCIONARIO', id_dependencia: idDep, dependencia: `Bienestar ${sufijo}` });

      await api('patch', `/api/users/${ok.body.data.id_usuario}/status`, { activo: false });
      await api('patch', `/api/dependencies/${idDep}/status`, { activo: false });
      const inactive = await api('post', '/api/users', newUser({ rol: 'FUNCIONARIO', id_dependencia: idDep }));
      expect(inactive.body.error.code).toBe('DEPENDENCY_INACTIVE');
    });

    test('listado con filtros por perfil, estado y búsqueda; nunca incluye password_hash', async () => {
      const marca = `Zeta${sufijo}`;
      await api('post', '/api/users', newUser({ nombres: marca, correo: `z1-${sufijo}@prueba.edu` }));
      await api('post', '/api/users', newUser({ nombres: marca, correo: `z2-${sufijo}@prueba.edu` }));

      const res = await api('get', `/api/users?q=${marca}&rol=ESTUDIANTE&activo=true&pageSize=10`);
      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBe(2);
      expect(res.body.data.every((u) => u.rol === 'ESTUDIANTE')).toBe(true);
      expect(JSON.stringify(res.body)).not.toMatch(/password_hash|\$2[aby]\$/);

      const paged = await api('get', `/api/users?q=${marca}&pageSize=1&page=2`);
      expect(paged.body.data).toHaveLength(1);
      expect(paged.body.meta).toEqual({ page: 2, pageSize: 1, total: 2 });
    });

    test('editar datos y perfil; no se puede usar el correo de otro; 404 si no existe', async () => {
      const a = (await api('post', '/api/users', newUser({ correo: `ed-a-${sufijo}@prueba.edu` }))).body.data;
      const b = (await api('post', '/api/users', newUser({ correo: `ed-b-${sufijo}@prueba.edu` }))).body.data;
      const payload = { nombres: 'Editado', apellidos: 'Cambiado', correo: a.correo, rol: 'SUPERVISOR', id_dependencia: null };

      const ok = await api('put', `/api/users/${a.id_usuario}`, payload);
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ nombres: 'Editado', rol: 'SUPERVISOR' });

      const dup = await api('put', `/api/users/${a.id_usuario}`, { ...payload, correo: b.correo });
      expect(dup.body.error.code).toBe('DUPLICATE_EMAIL');
      expect((await api('put', '/api/users/99999999', payload)).status).toBe(404);

      const audit = await query("SELECT detalle FROM auditoria WHERE operacion = 'USUARIO_EDITAR' AND id_recurso = $1", [String(a.id_usuario)]);
      expect(audit.rows[0].detalle.cambios.rol).toEqual({ antes: 'ESTUDIANTE', despues: 'SUPERVISOR' });
    });

    test('un administrador no puede desactivarse ni cambiar su propio perfil', async () => {
      const self = await api('patch', `/api/users/${admin.id}/status`, { activo: false });
      expect(self.status).toBe(422);
      expect(self.body.error.code).toBe('SELF_DEACTIVATION');

      const me = (await api('get', `/api/users/${admin.id}`)).body.data;
      const role = await api('put', `/api/users/${admin.id}`, { nombres: me.nombres, apellidos: me.apellidos, correo: me.correo, rol: 'SUPERVISOR', id_dependencia: null });
      expect(role.body.error.code).toBe('SELF_ROLE_CHANGE');
    });

    test('siempre queda un administrador activo', async () => {
      // Se desactivan temporalmente los demás administradores y se intenta degradar/desactivar al último desde otro admin
      const other = (await api('post', '/api/users', newUser({ rol: 'ADMINISTRADOR', correo: `adm2-${sufijo}@prueba.edu` }))).body.data;
      await query("UPDATE usuarios SET debe_cambiar_password = FALSE WHERE id_usuario = $1", [other.id_usuario]);
      const second = await loginAs(other.correo);
      expect(second.res.status).toBe(200);

      // Se dejan solo estos dos activos
      await query(
        `UPDATE usuarios SET activo = FALSE
          WHERE id_rol = (SELECT id_rol FROM roles WHERE nombre = 'ADMINISTRADOR') AND id_usuario NOT IN ($1, $2)`,
        [admin.id, other.id_usuario],
      );

      // El segundo admin desactiva al primero (queda él) => permitido... pero entonces el primero ya no puede operar.
      const deactivate = await second.agent.patch(`/api/users/${admin.id}/status`).set('X-CSRF-Token', second.csrf).send({ activo: false });
      expect(deactivate.status).toBe(200);

      // Ahora other es el único activo: nadie más puede desactivarlo ni degradarlo; se prueba con la regla directa del servicio
      const userAdmin = require('../../src/services/userAdmin.service');
      await expect(userAdmin.setStatus(other.id_usuario, false, { user: { id: admin.id }, ip: null })).rejects.toMatchObject({ code: 'LAST_ADMIN', status: 409 });
      await expect(
        userAdmin.update(other.id_usuario, { nombres: 'X', apellidos: 'Y', correo: other.correo, rol: 'SUPERVISOR', id_dependencia: null }, { user: { id: admin.id }, ip: null }),
      ).rejects.toMatchObject({ code: 'LAST_ADMIN' });

      // Se restaura al primer administrador para las demás pruebas
      await query('UPDATE usuarios SET activo = TRUE WHERE id_usuario = $1', [admin.id]);
      const again = await loginAs(`root-${sufijo}@prueba.edu`);
      admin = { agent: again.agent, csrf: again.csrf, id: admin.id };
    });

    test('desactivar cierra las sesiones de inmediato y bloquea el ingreso; reactivar lo permite', async () => {
      const created = (await api('post', '/api/users', newUser({ correo: `baja-${sufijo}@prueba.edu` }))).body.data;
      await query('UPDATE usuarios SET debe_cambiar_password = FALSE WHERE id_usuario = $1', [created.id_usuario]);
      const session = await loginAs(created.correo);
      expect((await session.agent.get('/api/auth/me')).status).toBe(200);

      expect((await api('patch', `/api/users/${created.id_usuario}/status`, { activo: false })).body.data.activo).toBe(false);
      expect((await session.agent.get('/api/auth/me')).status).toBe(401);
      const relog = await loginAs(created.correo);
      expect(relog.res.status).toBe(403);
      expect(relog.res.body.error.code).toBe('ACCOUNT_DISABLED');

      expect((await api('patch', `/api/users/${created.id_usuario}/status`, { activo: true })).body.data.activo).toBe(true);
      expect((await loginAs(created.correo)).res.status).toBe(200);
    });

    test('restablecer contraseña: la anterior deja de servir, exige cambio y cierra sesiones; no sobre uno mismo', async () => {
      const created = (await api('post', '/api/users', newUser({ correo: `reset-${sufijo}@prueba.edu` }))).body.data;
      await query('UPDATE usuarios SET debe_cambiar_password = FALSE WHERE id_usuario = $1', [created.id_usuario]);
      const session = await loginAs(created.correo);

      const res = await api('patch', `/api/users/${created.id_usuario}/password-reset`, { password_nueva: 'Temporal98765' });
      expect(res.status).toBe(200);
      expect((await session.agent.get('/api/auth/me')).status).toBe(401);
      expect((await loginAs(created.correo, PASSWORD)).res.status).toBe(401);
      const fresh = await loginAs(created.correo, 'Temporal98765');
      expect(fresh.res.status).toBe(200);
      expect(fresh.res.body.data.user.debe_cambiar_password).toBe(true);

      const own = await api('patch', `/api/users/${admin.id}/password-reset`, { password_nueva: 'Temporal98765' });
      expect(own.body.error.code).toBe('USE_OWN_PASSWORD_CHANGE');

      const audit = await query("SELECT detalle::text AS d FROM auditoria WHERE operacion = 'USUARIO_PASSWORD_RESET' AND id_recurso = $1", [String(created.id_usuario)]);
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].d).not.toMatch(/Temporal98765/);
    });

    test('supervisión: solo supervisores; dependencias existentes y activas; reemplazo completo; bloquea quitar el perfil', async () => {
      const d1 = (await api('post', '/api/dependencies', { nombre: `Sup1 ${sufijo}` })).body.data.id_dependencia;
      const d2 = (await api('post', '/api/dependencies', { nombre: `Sup2 ${sufijo}` })).body.data.id_dependencia;
      const sup = (await api('post', '/api/users', newUser({ rol: 'SUPERVISOR', correo: `sup-${sufijo}@prueba.edu` }))).body.data;
      const est = (await api('post', '/api/users', newUser({ correo: `no-sup-${sufijo}@prueba.edu` }))).body.data;

      const notSup = await api('put', `/api/users/${est.id_usuario}/supervision`, { ids_dependencias: [d1] });
      expect(notSup.status).toBe(422);
      expect(notSup.body.error.code).toBe('NOT_A_SUPERVISOR');

      expect((await api('put', `/api/users/${sup.id_usuario}/supervision`, { ids_dependencias: [99999999] })).body.error.code).toBe('INVALID_DEPENDENCY');

      const set = await api('put', `/api/users/${sup.id_usuario}/supervision`, { ids_dependencias: [d1, d2] });
      expect(set.status).toBe(200);
      expect(set.body.data.dependencias.map((d) => d.id_dependencia).sort()).toEqual([d1, d2].sort());

      const replace = await api('put', `/api/users/${sup.id_usuario}/supervision`, { ids_dependencias: [d2] });
      expect(replace.body.data.dependencias).toHaveLength(1);
      expect((await api('get', `/api/users/${sup.id_usuario}/supervision`)).body.data.dependencias[0].id_dependencia).toBe(d2);
      expect((await api('get', `/api/users/${sup.id_usuario}`)).body.data.dependencias_supervisadas).toHaveLength(1);

      const demote = await api('put', `/api/users/${sup.id_usuario}`, { nombres: sup.nombres, apellidos: sup.apellidos, correo: sup.correo, rol: 'ESTUDIANTE', id_dependencia: null });
      expect(demote.status).toBe(409);
      expect(demote.body.error.code).toBe('HAS_SUPERVISION');

      // Vaciar la lista es válido y entonces sí se puede cambiar el perfil
      expect((await api('put', `/api/users/${sup.id_usuario}/supervision`, { ids_dependencias: [] })).body.data.dependencias).toEqual([]);
      expect((await api('put', `/api/users/${sup.id_usuario}`, { nombres: sup.nombres, apellidos: sup.apellidos, correo: sup.correo, rol: 'ESTUDIANTE', id_dependencia: null })).status).toBe(200);
    });

    test('un funcionario con asignaciones activas no se desactiva ni se traslada', async () => {
      const dep = (await api('post', '/api/dependencies', { nombre: `Atención ${sufijo}` })).body.data.id_dependencia;
      const dep2 = (await api('post', '/api/dependencies', { nombre: `Otra ${sufijo}` })).body.data.id_dependencia;
      const cat = (await api('post', '/api/categories', { nombre: `Cat atención ${sufijo}` })).body.data.id_categoria;
      const srv = (await api('post', '/api/services', { nombre: `Servicio atención ${sufijo}`, id_categoria: cat, id_dependencia: dep })).body.data.id_servicio;
      const est = (await api('post', '/api/users', newUser({ correo: `sol-${sufijo}@prueba.edu` }))).body.data;
      const fun = (await api('post', '/api/users', newUser({ rol: 'FUNCIONARIO', id_dependencia: dep, correo: `fun-${sufijo}@prueba.edu` }))).body.data;

      const sol = await query(
        "INSERT INTO solicitudes (id_estudiante, id_servicio, asunto, descripcion) VALUES ($1, $2, 'Asunto', 'Descripción') RETURNING id_solicitud",
        [est.id_usuario, srv],
      );
      await query('INSERT INTO asignaciones (id_solicitud, id_funcionario, id_asignador) VALUES ($1, $2, $3)', [sol.rows[0].id_solicitud, fun.id_usuario, admin.id]);

      const off = await api('patch', `/api/users/${fun.id_usuario}/status`, { activo: false });
      expect(off.status).toBe(409);
      expect(off.body.error.code).toBe('HAS_ACTIVE_ASSIGNMENTS');
      expect(off.body.error.details[0]).toMatchObject({ asignaciones_activas: 1 });

      const move = await api('put', `/api/users/${fun.id_usuario}`, { nombres: fun.nombres, apellidos: fun.apellidos, correo: fun.correo, rol: 'FUNCIONARIO', id_dependencia: dep2 });
      expect(move.body.error.code).toBe('HAS_ACTIVE_ASSIGNMENTS');

      // Solo cambia el nombre (sin perfil ni dependencia): permitido
      const rename = await api('put', `/api/users/${fun.id_usuario}`, { nombres: 'Renombrado', apellidos: fun.apellidos, correo: fun.correo, rol: 'FUNCIONARIO', id_dependencia: dep });
      expect(rename.status).toBe(200);
    });

    test('la auditoría de configuración registra quién, qué y cuándo', async () => {
      const { rows } = await query(
        "SELECT DISTINCT operacion FROM auditoria WHERE id_usuario = $1 AND resultado = 'EXITO'",
        [admin.id],
      );
      const ops = rows.map((r) => r.operacion);
      expect(ops).toEqual(expect.arrayContaining([
        'DEPENDENCIA_CREAR', 'DEPENDENCIA_ESTADO', 'CATEGORIA_CREAR', 'SERVICIO_CREAR', 'SERVICIO_EDITAR',
        'USUARIO_CREAR', 'USUARIO_EDITAR', 'USUARIO_ESTADO', 'USUARIO_SUPERVISION',
      ]));
    });
  });
});
