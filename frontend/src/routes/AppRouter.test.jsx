import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import AppRouter from './AppRouter.jsx';
import { ROLES } from '../utils/constants.js';

vi.mock('../services/reports.service.js', () => {
  const empty = { periodo: { desde: '2026-11-01', hasta: '2026-11-30', por_defecto: true }, ambito: 'x', criterio: 'Criterio', filas: [], indicadores: {} };
  const fn = () => vi.fn().mockResolvedValue(empty);
  return { reportsApi: { dashboard: vi.fn().mockResolvedValue({ ...empty, indicadores: { total: 0, pendientes: 0, en_proceso: 0, resueltas: 0, cerradas: 0, rechazadas: 0, abiertas: 0, con_retraso: 0 } }), byStatus: fn(), byCategory: fn(), byDependency: fn(), byPeriod: fn(), exportCsv: vi.fn() } };
});
vi.mock('../services/audit.service.js', () => ({
  auditApi: { list: vi.fn().mockResolvedValue({ items: [], meta: { page: 1, pageSize: 20, total: 0 } }), get: vi.fn(), filters: vi.fn().mockResolvedValue({ operaciones: [], recursos: [] }) },
}));
vi.mock('../services/catalog.service.js', () => {
  const make = () => ({ list: vi.fn().mockResolvedValue({ items: [], meta: {} }), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn() });
  return { categoriesApi: make(), dependenciesApi: make(), servicesApi: make() };
});

const makeUser = (rol, over = {}) => ({
  id_usuario: 1, nombres: 'Ana', apellidos: 'Pérez', correo: 'ana@uni.edu', rol,
  id_dependencia: null, dependencia: null, debe_cambiar_password: false, ...over,
});

function renderAt(path, { status = 'authenticated', user = null } = {}) {
  const value = {
    user, status, isAuthenticated: status === 'authenticated', sessionExpired: false,
    clearSessionExpired: vi.fn(), login: vi.fn(), logout: vi.fn(), changePassword: vi.fn(),
  };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <AppRouter />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const menu = () => screen.getByRole('complementary', { name: /navegación principal/i });
const menuHas = (name) => Boolean(menu().querySelector(`a[href="${name}"]`));

describe('rutas protegidas', () => {
  test('mientras se verifica la sesión muestra la carga, no el login', () => {
    renderAt('/dashboard', { status: 'loading' });
    expect(screen.getAllByText(/verificando tu sesión/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: /iniciar sesión/i })).toBeNull();
  });

  test('sin sesión, una ruta protegida lleva al login', () => {
    renderAt('/admin/usuarios', { status: 'anonymous' });
    expect(screen.getByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  test('con sesión, /login redirige al inicio', () => {
    renderAt('/login', { user: makeUser(ROLES.ESTUDIANTE) });
    expect(screen.getByRole('heading', { name: /hola, ana/i })).toBeInTheDocument();
  });

  test('"/" lleva al inicio del usuario autenticado', () => {
    renderAt('/', { user: makeUser(ROLES.FUNCIONARIO) });
    expect(screen.getByRole('heading', { name: /hola, ana/i })).toBeInTheDocument();
  });

  test('si debe cambiar la contraseña, cualquier ruta lo lleva a cambiarla', () => {
    renderAt('/solicitudes', { user: makeUser(ROLES.ESTUDIANTE, { debe_cambiar_password: true }) });
    expect(screen.getByRole('heading', { name: /debes cambiar tu contraseña/i })).toBeInTheDocument();
  });

  test('ruta inexistente => 404', () => {
    renderAt('/no-existe', { user: makeUser(ROLES.ADMINISTRADOR) });
    expect(screen.getByRole('heading', { name: /página no encontrada/i })).toBeInTheDocument();
  });
});

describe('acceso por perfil', () => {
  test.each([
    [ROLES.ESTUDIANTE, '/admin/usuarios'],
    [ROLES.FUNCIONARIO, '/admin/auditoria'],
    [ROLES.SUPERVISOR, '/admin/categorias'],
    [ROLES.ESTUDIANTE, '/reportes'],
    [ROLES.ADMINISTRADOR, '/solicitudes/nueva'],
    [ROLES.SUPERVISOR, '/asignaciones'],
  ])('%s en %s => acceso denegado', (rol, path) => {
    renderAt(path, { user: makeUser(rol) });
    expect(screen.getByText(/no tienes acceso a esta sección/i)).toBeInTheDocument();
  });

  test('ADMINISTRADOR en /admin/auditoria => pantalla de auditoría', async () => {
    renderAt('/admin/auditoria', { user: makeUser(ROLES.ADMINISTRADOR) });
    expect(screen.queryByText(/no tienes acceso a esta sección/i)).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Auditoría' })).toBeInTheDocument();
  });

  test.each([ROLES.ADMINISTRADOR, ROLES.SUPERVISOR, ROLES.FUNCIONARIO])('%s en /reportes => pantalla de reportes', async (rol) => {
    renderAt('/reportes', { user: makeUser(rol) });
    expect(screen.queryByText(/no tienes acceso a esta sección/i)).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Reportes' })).toBeInTheDocument();
  });

  test('cada perfil ve en el menú solo sus opciones', () => {
    const { unmount } = renderAt('/dashboard', { user: makeUser(ROLES.ESTUDIANTE) });
    expect(menuHas('/solicitudes/nueva')).toBe(true);
    expect(menuHas('/admin/usuarios')).toBe(false);
    expect(menuHas('/reportes')).toBe(false);
    expect(menu()).toHaveTextContent('Mis solicitudes');
    unmount();

    renderAt('/dashboard', { user: makeUser(ROLES.ADMINISTRADOR) });
    expect(menuHas('/admin/usuarios')).toBe(true);
    expect(menuHas('/admin/auditoria')).toBe(true);
    expect(menuHas('/solicitudes/nueva')).toBe(false);
  });

  test('el encabezado muestra el nombre y el perfil del usuario', () => {
    renderAt('/dashboard', { user: makeUser(ROLES.SUPERVISOR) });
    expect(screen.getByRole('button', { name: /ana pérez/i })).toHaveTextContent('Supervisor');
  });
});
