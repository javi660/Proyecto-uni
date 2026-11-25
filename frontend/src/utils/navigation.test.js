import { describe, expect, test } from 'vitest';
import { APP_ROUTES, menuSectionsForRole, routesForRole, labelFor } from './navigation.js';
import { ROLES } from './constants.js';

const paths = (role) => routesForRole(role).map((r) => r.path);

describe('navegación por perfil', () => {
  test('el administrador ve la administración y la auditoría', () => {
    expect(paths(ROLES.ADMINISTRADOR)).toEqual(
      expect.arrayContaining(['/admin/usuarios', '/admin/categorias', '/admin/servicios', '/admin/dependencias', '/admin/auditoria', '/reportes']),
    );
    expect(paths(ROLES.ADMINISTRADOR)).not.toContain('/solicitudes/nueva');
  });

  test('el estudiante solo ve solicitudes, nueva solicitud, notificaciones y perfil', () => {
    expect(paths(ROLES.ESTUDIANTE)).toEqual(['/dashboard', '/solicitudes', '/solicitudes/nueva', '/notificaciones', '/perfil']);
  });

  test('el funcionario ve asignaciones y reportes, pero no administración', () => {
    const p = paths(ROLES.FUNCIONARIO);
    expect(p).toEqual(expect.arrayContaining(['/asignaciones', '/reportes']));
    expect(p.some((x) => x.startsWith('/admin'))).toBe(false);
    expect(p).not.toContain('/solicitudes/nueva');
  });

  test('el supervisor ve reportes y solicitudes, no administración ni asignaciones propias', () => {
    const p = paths(ROLES.SUPERVISOR);
    expect(p).toEqual(expect.arrayContaining(['/solicitudes', '/reportes']));
    expect(p.some((x) => x.startsWith('/admin'))).toBe(false);
    expect(p).not.toContain('/asignaciones');
  });

  test('el estudiante ve "Mis solicitudes" y los demás "Solicitudes"', () => {
    const route = APP_ROUTES.find((r) => r.path === '/solicitudes');
    expect(labelFor(route, ROLES.ESTUDIANTE)).toBe('Mis solicitudes');
    expect(labelFor(route, ROLES.SUPERVISOR)).toBe('Solicitudes');
  });

  test('las secciones se agrupan en orden y un perfil desconocido no ve nada', () => {
    expect(menuSectionsForRole(ROLES.ADMINISTRADOR).map((s) => s.title)).toEqual(['Principal', 'Administración', 'Cuenta']);
    expect(menuSectionsForRole('HACKER')).toEqual([]);
  });

  test('todas las rutas tienen al menos un perfil y una fase', () => {
    APP_ROUTES.forEach((r) => {
      expect(r.roles.length).toBeGreaterThan(0);
      expect(Number.isInteger(r.phase)).toBe(true);
    });
  });
});
