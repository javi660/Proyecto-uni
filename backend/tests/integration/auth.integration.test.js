'use strict';

const request = require('supertest');

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = HAS_DB ? describe : describe.skip;

describeDb('autenticación y autorización con PostgreSQL real', () => {
  let app;
  let query;
  let closePool;
  let userRepository;
  let hashPassword;
  let ROLES;
  const PASSWORD = 'Valida12345';
  const users = {};

  const email = (rol) => `${rol.toLowerCase()}@prueba.edu`;

  async function csrfFor(agent) {
    const res = await agent.get('/api/auth/csrf');
    return res.body.data.csrf_token;
  }

  async function loginAs(rol, password = PASSWORD) {
    const agent = request.agent(app);
    const csrf = await csrfFor(agent);
    const res = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ correo: email(rol), password });
    return { agent, csrf, res };
  }

  const cookieValue = (res, name) => {
    const c = (res.headers['set-cookie'] || []).find((x) => x.startsWith(`${name}=`));
    return c ? c.split(';')[0].slice(name.length + 1) : null;
  };

  beforeAll(async () => {
    const { createApp: createAppFn } = require('../../src/app');
    ({ query, closePool } = require('../../src/config/database'));
    userRepository = require('../../src/repositories/user.repository');
    ({ hashPassword } = require('../../src/utils/password'));
    ({ ROLES } = require('../../src/utils/constants'));
    const { authenticate } = require('../../src/middleware/authenticate');
    const { authorize } = require('../../src/middleware/authorize');

    const guarded = [
      ['admin', [ROLES.ADMINISTRADOR]],
      ['estudiante', [ROLES.ESTUDIANTE]],
      ['funcionario', [ROLES.FUNCIONARIO]],
      ['supervisor', [ROLES.SUPERVISOR, ROLES.ADMINISTRADOR]],
    ];
    app = createAppFn({
      registerRoutes: (a) => {
        guarded.forEach(([name, roles]) => {
          a.get(`/api/_t/${name}`, authenticate(), authorize(...roles), (req, res) => res.json({ ok: true, rol: req.user.rol }));
        });
        a.get('/api/_t/libre', authenticate(), (req, res) => res.json({ ok: true }));
      },
    });

    const hash = await hashPassword(PASSWORD);
    // El funcionario debe pertenecer a una dependencia (regla de negocio de la base de datos)
    const dep = await query("INSERT INTO dependencias (nombre) VALUES ('Dependencia de prueba') RETURNING id_dependencia");
    const idDependencia = dep.rows[0].id_dependencia;
    // Los usuarios se crean una sola vez; la base de pruebas se reinicia en cada ejecución
    for (const rol of Object.values(ROLES)) {
      users[rol] = await userRepository.create({
        nombres: rol, apellidos: 'Prueba', correo: email(rol), passwordHash: hash, rol,
        idDependencia: rol === ROLES.FUNCIONARIO ? idDependencia : null, debeCambiarPassword: false,
      });
    }
  });

  afterAll(async () => {
    if (closePool) await closePool();
  });

  describe('login de los 4 perfiles', () => {
    test.each(['ADMINISTRADOR', 'ESTUDIANTE', 'FUNCIONARIO', 'SUPERVISOR'])('%s inicia sesión y /me devuelve su perfil', async (rol) => {
      const { agent, res } = await loginAs(rol);
      expect(res.status).toBe(200);
      expect(res.body.data.user.rol).toBe(rol);
      expect(JSON.stringify(res.body)).not.toMatch(/password_hash|\$2[aby]\$/);

      const me = await agent.get('/api/auth/me');
      expect(me.status).toBe(200);
      expect(me.body.data.user.correo).toBe(email(rol));
    });

    test('contraseña incorrecta y correo inexistente => misma respuesta 401', async () => {
      const a = await loginAs('ESTUDIANTE', 'Incorrecta123');
      const agent = request.agent(app);
      const csrf = await csrfFor(agent);
      const b = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ correo: 'nadie@prueba.edu', password: 'Incorrecta123' });
      expect(a.res.status).toBe(401);
      expect(a.res.body).toEqual(b.body);
    });

    test('el login deja registro de auditoría (éxito y fallo) sin secretos', async () => {
      await loginAs('ADMINISTRADOR');
      await loginAs('ADMINISTRADOR', 'Incorrecta123');
      const { rows } = await query(
        "SELECT resultado, detalle::text AS detalle FROM auditoria WHERE operacion = 'LOGIN' AND id_usuario = $1",
        [users.ADMINISTRADOR.id_usuario],
      );
      expect(rows.map((r) => r.resultado)).toEqual(expect.arrayContaining(['EXITO', 'FALLO']));
      rows.forEach((r) => expect(r.detalle || '').not.toMatch(/Valida12345|Incorrecta123/));
    });
  });

  describe('matriz de acceso a rutas por perfil (4 perfiles x 4 rutas)', () => {
    const matrix = {
      ADMINISTRADOR: { admin: 200, estudiante: 403, funcionario: 403, supervisor: 200 },
      ESTUDIANTE: { admin: 403, estudiante: 200, funcionario: 403, supervisor: 403 },
      FUNCIONARIO: { admin: 403, estudiante: 403, funcionario: 200, supervisor: 403 },
      SUPERVISOR: { admin: 403, estudiante: 403, funcionario: 403, supervisor: 200 },
    };

    test.each(Object.entries(matrix))('%s', async (rol, expected) => {
      const { agent } = await loginAs(rol);
      for (const [ruta, status] of Object.entries(expected)) {
        const res = await agent.get(`/api/_t/${ruta}`);
        expect({ ruta, status: res.status }).toEqual({ ruta, status });
      }
    });

    test('sin sesión => 401 en todas las rutas', async () => {
      for (const ruta of ['admin', 'estudiante', 'funcionario', 'supervisor', 'libre']) {
        const res = await request(app).get(`/api/_t/${ruta}`);
        expect(res.status).toBe(401);
      }
    });
  });

  describe('el rol y el estado se leen de la base de datos en cada petición', () => {
    test('cambiar el perfil en la base surte efecto de inmediato', async () => {
      const { agent } = await loginAs('ESTUDIANTE');
      expect((await agent.get('/api/_t/estudiante')).status).toBe(200);
      expect((await agent.get('/api/_t/supervisor')).status).toBe(403);

      await query("UPDATE usuarios SET id_rol = (SELECT id_rol FROM roles WHERE nombre = 'SUPERVISOR') WHERE id_usuario = $1", [users.ESTUDIANTE.id_usuario]);
      expect((await agent.get('/api/_t/estudiante')).status).toBe(403);
      expect((await agent.get('/api/_t/supervisor')).status).toBe(200);

      await query("UPDATE usuarios SET id_rol = (SELECT id_rol FROM roles WHERE nombre = 'ESTUDIANTE') WHERE id_usuario = $1", [users.ESTUDIANTE.id_usuario]);
    });

    test('desactivar al usuario invalida su sesión en la siguiente petición y bloquea el login', async () => {
      const { agent } = await loginAs('SUPERVISOR');
      expect((await agent.get('/api/_t/supervisor')).status).toBe(200);

      await query('UPDATE usuarios SET activo = FALSE WHERE id_usuario = $1', [users.SUPERVISOR.id_usuario]);
      const after = await agent.get('/api/_t/supervisor');
      expect(after.status).toBe(401);

      const relog = await loginAs('SUPERVISOR');
      expect(relog.res.status).toBe(403);
      expect(relog.res.body.error.code).toBe('ACCOUNT_DISABLED');

      await query('UPDATE usuarios SET activo = TRUE WHERE id_usuario = $1', [users.SUPERVISOR.id_usuario]);
    });
  });

  describe('sesiones: refresh con rotación, reutilización y logout', () => {
    test('refresh rota el token; reutilizar el anterior revoca todas las sesiones', async () => {
      const { agent, csrf, res } = await loginAs('ESTUDIANTE');
      const oldRefresh = cookieValue(res, 'sgssu_rt');
      expect(oldRefresh).toBeTruthy();

      const r1 = await agent.post('/api/auth/refresh').set('X-CSRF-Token', csrf);
      expect(r1.status).toBe(200);
      const newRefresh = cookieValue(r1, 'sgssu_rt');
      expect(newRefresh).toBeTruthy();
      expect(newRefresh).not.toBe(oldRefresh);
      expect((await agent.get('/api/_t/estudiante')).status).toBe(200);

      // Un atacante reutiliza el refresh token ya rotado
      const attacker = request.agent(app);
      const acsrf = await csrfFor(attacker);
      const replay = await attacker.post('/api/auth/refresh').set('Cookie', `sgssu_csrf=${acsrf}; sgssu_rt=${oldRefresh}`).set('X-CSRF-Token', acsrf);
      expect(replay.status).toBe(401);

      // La sesión legítima también queda revocada (por precaución)
      expect((await agent.get('/api/_t/estudiante')).status).toBe(401);
      const { rows } = await query(
        "SELECT 1 FROM auditoria WHERE operacion = 'REFRESH_REUTILIZADO' AND id_usuario = $1",
        [users.ESTUDIANTE.id_usuario],
      );
      expect(rows.length).toBeGreaterThan(0);
    });

    test('los refresh tokens se guardan como hash, nunca en claro', async () => {
      const { res } = await loginAs('ADMINISTRADOR');
      const refresh = cookieValue(res, 'sgssu_rt');
      const { rows } = await query('SELECT token_hash FROM refresh_tokens');
      expect(rows.some((r) => r.token_hash === refresh)).toBe(false);
      expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.token_hash))).toBe(true);
    });

    test('logout revoca la sesión de inmediato: el access token deja de servir', async () => {
      const { agent, csrf, res } = await loginAs('ADMINISTRADOR');
      const accessCookie = `sgssu_at=${cookieValue(res, 'sgssu_at')}`;
      expect((await agent.get('/api/_t/admin')).status).toBe(200);

      const out = await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf);
      expect(out.status).toBe(200);

      // Aun conservando una copia del access token, ya no es válido
      const stolen = await request(app).get('/api/_t/admin').set('Cookie', accessCookie);
      expect(stolen.status).toBe(401);
      expect(stolen.body.error.code).toBe('SESSION_REVOKED');
    });

    test('refresh con un token inventado => 401', async () => {
      const agent = request.agent(app);
      const csrf = await csrfFor(agent);
      const res = await agent.post('/api/auth/refresh').set('Cookie', `sgssu_csrf=${csrf}; sgssu_rt=inventado`).set('X-CSRF-Token', csrf);
      expect(res.status).toBe(401);
    });
  });

  describe('CSRF', () => {
    test('POST sin token CSRF => 403 aunque haya sesión', async () => {
      const { agent } = await loginAs('ESTUDIANTE');
      const res = await agent.post('/api/auth/logout');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });
  });

  describe('cambio de contraseña obligatorio y voluntario', () => {
    test('debe_cambiar_password bloquea rutas hasta cambiarla; luego revoca sesiones previas', async () => {
      const mustChange = await userRepository.create({
        nombres: 'Nuevo', apellidos: 'Usuario', correo: 'nuevo@prueba.edu', passwordHash: await hashPassword(PASSWORD),
        rol: ROLES.ESTUDIANTE, idDependencia: null, debeCambiarPassword: true,
      });
      expect(mustChange.id_usuario).toBeTruthy();

      const agent = request.agent(app);
      const csrf = await csrfFor(agent);
      const login = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ correo: 'nuevo@prueba.edu', password: PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.data.user.debe_cambiar_password).toBe(true);
      const oldAccess = `sgssu_at=${cookieValue(login, 'sgssu_at')}`;

      const blocked = await agent.get('/api/_t/libre');
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
      expect((await agent.get('/api/auth/me')).status).toBe(200);

      const wrong = await agent.patch('/api/auth/password').set('X-CSRF-Token', csrf).send({ password_actual: 'Incorrecta123', password_nueva: 'Nueva123456' });
      expect(wrong.status).toBe(422);

      const changed = await agent.patch('/api/auth/password').set('X-CSRF-Token', csrf).send({ password_actual: PASSWORD, password_nueva: 'Nueva123456' });
      expect(changed.status).toBe(200);
      expect(changed.body.data.user.debe_cambiar_password).toBe(false);

      expect((await agent.get('/api/_t/libre')).status).toBe(200);
      expect((await request(app).get('/api/_t/libre').set('Cookie', oldAccess)).status).toBe(401);

      const oldLogin = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ correo: 'nuevo@prueba.edu', password: PASSWORD });
      expect(oldLogin.status).toBe(401);
      const newLogin = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ correo: 'nuevo@prueba.edu', password: 'Nueva123456' });
      expect(newLogin.status).toBe(200);
    });
  });
});
