'use strict';

jest.mock('../src/repositories/user.repository');
jest.mock('../src/repositories/token.repository');
jest.mock('../src/repositories/audit.repository');
jest.mock('../src/repositories/dependency.repository');
jest.mock('../src/repositories/category.repository');
jest.mock('../src/repositories/service.repository');
jest.mock('../src/repositories/supervision.repository');
jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  closePool: jest.fn(),
  withTransaction: jest.fn(async (fn) => fn({ fake: true })),
}));

const request = require('supertest');
const userRepository = require('../src/repositories/user.repository');
const dependencyRepository = require('../src/repositories/dependency.repository');
const categoryRepository = require('../src/repositories/category.repository');
const serviceRepository = require('../src/repositories/service.repository');
const { createApp } = require('../src/app');
const { signAccessToken } = require('../src/utils/tokens');
const { ROLES } = require('../src/utils/constants');

const { ADMINISTRADOR: ADM, ESTUDIANTE: EST, FUNCIONARIO: FUN, SUPERVISOR: SUP } = ROLES;
const app = createApp();

const sessionRow = (rol) => ({
  id_usuario: 1, nombres: 'U', apellidos: 'P', correo: 'u@uni.edu', rol, rol_activo: true, activo: true,
  id_dependencia: null, dependencia: null, debe_cambiar_password: false, sesion_vigente: true,
});

/** Cliente con sesión del perfil indicado y token CSRF. */
async function clientAs(rol) {
  userRepository.findSessionUser.mockResolvedValue(sessionRow(rol));
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/auth/csrf')).body.data.csrf_token;
  const cookie = `sgssu_csrf=${csrf}; sgssu_at=${signAccessToken({ userId: 1, sessionId: 1 })}`;
  const call = (method, url, body) => {
    let req = request(app)[method](url).set('Cookie', cookie);
    if (method !== 'get') req = req.set('X-CSRF-Token', csrf).send(body ?? {});
    return req;
  };
  return { call, cookie, csrf };
}

beforeEach(() => {
  [dependencyRepository, categoryRepository, serviceRepository].forEach((repo) => {
    repo.list.mockResolvedValue({ rows: [], total: 0 });
    repo.findById.mockResolvedValue(null);
  });
  userRepository.list.mockResolvedValue({ rows: [], total: 0 });
  userRepository.findPublicById.mockResolvedValue(null);
});

const NON_ADMIN = [EST, FUN, SUP];

describe('usuarios: exclusivo del administrador (4 perfiles x 8 rutas)', () => {
  const routes = [
    ['get', '/api/users'],
    ['post', '/api/users', {}],
    ['get', '/api/users/5'],
    ['put', '/api/users/5', {}],
    ['patch', '/api/users/5/status', { activo: false }],
    ['patch', '/api/users/5/password-reset', {}],
    ['get', '/api/users/5/supervision'],
    ['put', '/api/users/5/supervision', {}],
  ];

  test.each(NON_ADMIN)('%s => 403 en todas las rutas', async (rol) => {
    const { call } = await clientAs(rol);
    for (const [method, url, body] of routes) {
      const res = await call(method, url, body);
      expect({ url, method, status: res.status }).toEqual({ url, method, status: 403 });
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(userRepository.list).not.toHaveBeenCalled();
  });

  test('administrador: el listado llega al servicio y las altas con datos inválidos dan 400', async () => {
    const { call } = await clientAs(ADM);
    expect((await call('get', '/api/users')).status).toBe(200);
    expect((await call('post', '/api/users', {})).status).toBe(400);
  });

  test('sin sesión => 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});

describe('catálogo: consulta para todos, gestión solo del administrador', () => {
  const mutations = [
    ['post', '/api/dependencies', { nombre: 'X' }],
    ['put', '/api/dependencies/1', { nombre: 'X' }],
    ['patch', '/api/dependencies/1/status', { activo: false }],
    ['post', '/api/categories', { nombre: 'X' }],
    ['put', '/api/categories/1', { nombre: 'X' }],
    ['patch', '/api/categories/1/status', { activo: false }],
    ['post', '/api/services', { nombre: 'X', id_categoria: 1, id_dependencia: 1 }],
    ['put', '/api/services/1', { nombre: 'X', id_categoria: 1, id_dependencia: 1 }],
    ['patch', '/api/services/1/status', { activo: false }],
  ];

  test.each(NON_ADMIN)('%s no puede crear, editar ni cambiar el estado (403)', async (rol) => {
    const { call } = await clientAs(rol);
    for (const [method, url, body] of mutations) {
      const res = await call(method, url, body);
      expect({ url, method, status: res.status }).toEqual({ url, method, status: 403 });
    }
  });

  test.each([ADM, EST, FUN, SUP])('%s puede consultar los tres catálogos', async (rol) => {
    const { call } = await clientAs(rol);
    for (const url of ['/api/dependencies', '/api/categories', '/api/services']) {
      expect((await call('get', url)).status).toBe(200);
    }
  });

  test.each(NON_ADMIN)('%s solo ve registros activos: el filtro se fuerza en el servidor', async (rol) => {
    const { call } = await clientAs(rol);
    await call('get', '/api/dependencies?activo=false');
    await call('get', '/api/categories?activo=false');
    await call('get', '/api/services?activo=false');
    expect(dependencyRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ activo: true }));
    expect(categoryRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ activo: true }));
    expect(serviceRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ activo: true }));
  });

  test('el administrador sí puede filtrar por inactivos', async () => {
    const { call } = await clientAs(ADM);
    await call('get', '/api/dependencies?activo=false');
    expect(dependencyRepository.list).toHaveBeenLastCalledWith(expect.objectContaining({ activo: false }));
  });

  test('un registro inactivo es 404 para no administradores y visible para el administrador', async () => {
    dependencyRepository.findById.mockResolvedValue({ id_dependencia: 3, nombre: 'Vieja', activo: false });
    const student = await clientAs(EST);
    expect((await student.call('get', '/api/dependencies/3')).status).toBe(404);
    const admin = await clientAs(ADM);
    expect((await admin.call('get', '/api/dependencies/3')).status).toBe(200);
  });
});

describe('validación de entradas (administrador)', () => {
  let call;
  beforeEach(async () => {
    ({ call } = await clientAs(ADM));
  });

  test('id de ruta inválido => 400', async () => {
    for (const bad of ['abc', '0', '-4', '1.5']) {
      expect((await call('get', `/api/users/${bad}`)).status).toBe(400);
    }
  });

  test('paginación y filtros inválidos => 400', async () => {
    expect((await call('get', '/api/users?pageSize=101')).status).toBe(400);
    expect((await call('get', '/api/users?page=0')).status).toBe(400);
    expect((await call('get', '/api/users?activo=quizas')).status).toBe(400);
    expect((await call('get', '/api/users?rol=SUPERUSUARIO')).status).toBe(400);
    expect((await call('get', '/api/users?campo=raro')).status).toBe(400);
  });

  test('alta de usuario: contraseña débil, correo inválido, perfil desconocido y campos extra', async () => {
    const ok = { nombres: 'Ana', apellidos: 'Pérez', correo: 'ana@uni.edu', rol: EST, password_inicial: 'Valida12345' };
    expect((await call('post', '/api/users', { ...ok, password_inicial: 'corta' })).status).toBe(400);
    expect((await call('post', '/api/users', { ...ok, correo: 'no-es-correo' })).status).toBe(400);
    expect((await call('post', '/api/users', { ...ok, rol: 'DIOS' })).status).toBe(400);
    expect((await call('post', '/api/users', { ...ok, activo: false })).status).toBe(400);
    expect((await call('post', '/api/users', { ...ok, password_hash: 'x' })).status).toBe(400);
    expect((await call('post', '/api/users', { ...ok, nombres: '   ' })).status).toBe(400);
  });

  test('servicio: SLA fuera de rango o no entero, ids faltantes', async () => {
    const base = { nombre: 'Certificado', id_categoria: 1, id_dependencia: 1 };
    for (const sla of [0, -5, 8761, 1.5, '72']) {
      expect((await call('post', '/api/services', { ...base, sla_horas: sla })).status).toBe(400);
    }
    expect((await call('post', '/api/services', { nombre: 'X' })).status).toBe(400);
    expect((await call('post', '/api/services', { ...base, id_categoria: 'uno' })).status).toBe(400);
  });

  test('estado: exige un booleano; nombre demasiado largo o vacío', async () => {
    expect((await call('patch', '/api/dependencies/1/status', { activo: 'false' })).status).toBe(400);
    expect((await call('patch', '/api/dependencies/1/status', {})).status).toBe(400);
    expect((await call('post', '/api/categories', { nombre: 'x'.repeat(101) })).status).toBe(400);
    expect((await call('post', '/api/categories', { nombre: '  ' })).status).toBe(400);
  });

  test('supervisión: lista con repetidos o ids inválidos', async () => {
    expect((await call('put', '/api/users/5/supervision', { ids_dependencias: [1, 1] })).status).toBe(400);
    expect((await call('put', '/api/users/5/supervision', { ids_dependencias: [0] })).status).toBe(400);
    expect((await call('put', '/api/users/5/supervision', { ids_dependencias: 'todas' })).status).toBe(400);
    expect((await call('put', '/api/users/5/supervision', {})).status).toBe(400);
  });

  test('restablecer contraseña exige una contraseña válida', async () => {
    expect((await call('patch', '/api/users/5/password-reset', { password_nueva: 'debil' })).status).toBe(400);
  });

  test('las peticiones que cambian datos exigen CSRF', async () => {
    const { cookie } = await clientAs(ADM);
    const res = await request(app).post('/api/categories').set('Cookie', cookie).send({ nombre: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });
});

describe('búsqueda segura', () => {
  const { escapeLike } = require('../src/utils/sql');
  test('escapeLike neutraliza los comodines', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
    expect(escapeLike("o'brien; DROP TABLE usuarios;--")).toBe("o'brien; DROP TABLE usuarios;--");
  });

  test('createWhere numera parámetros y nunca inserta valores en el SQL', () => {
    const { createWhere } = require('../src/utils/sql');
    const where = createWhere();
    where.add('a = $?', "x' OR '1'='1");
    where.add('(b ILIKE $? OR c ILIKE $?)', '%q%');
    const { clause, params } = where.build();
    expect(clause).toBe('WHERE a = $1 AND (b ILIKE $2 OR c ILIKE $2)');
    expect(clause).not.toMatch(/OR '1'/);
    expect(params).toEqual(["x' OR '1'='1", '%q%']);
  });
});
