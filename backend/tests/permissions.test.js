'use strict';

const { PERMISSIONS, GRANTS, can, permissionsFor, requestScopeFor, reportScopeFor } = require('../src/utils/permissions');
const { ROLES } = require('../src/utils/constants');

const { ADMINISTRADOR: ADM, ESTUDIANTE: EST, FUNCIONARIO: FUN, SUPERVISOR: SUP } = ROLES;

// permiso -> perfiles autorizados (matriz esperada, escrita aparte de la implementación)
const EXPECTED = {
  [PERMISSIONS.USERS_MANAGE]: [ADM],
  [PERMISSIONS.CATEGORIES_MANAGE]: [ADM],
  [PERMISSIONS.SERVICES_MANAGE]: [ADM],
  [PERMISSIONS.DEPENDENCIES_MANAGE]: [ADM],
  [PERMISSIONS.REQUESTS_CREATE]: [EST],
  [PERMISSIONS.REQUESTS_ASSIGN]: [ADM, SUP],
  [PERMISSIONS.REQUESTS_REJECT]: [ADM, SUP],
  [PERMISSIONS.REQUESTS_CHANGE_PRIORITY]: [ADM, SUP],
  [PERMISSIONS.OFFICIALS_LIST]: [ADM, SUP],
  [PERMISSIONS.REQUESTS_ATTEND]: [FUN],
  [PERMISSIONS.RESPONSES_CREATE]: [FUN],
  [PERMISSIONS.REQUESTS_CLOSE]: [ADM, EST, SUP],
  [PERMISSIONS.REQUESTS_REOPEN]: [EST],
  [PERMISSIONS.RESPONSES_VIEW_INTERNAL]: [ADM, FUN, SUP],
  [PERMISSIONS.ATTACHMENTS_UPLOAD]: [EST, FUN],
  [PERMISSIONS.REPORTS_VIEW]: [ADM, FUN, SUP],
  [PERMISSIONS.AUDIT_VIEW]: [ADM],
  [PERMISSIONS.CATALOG_VIEW]: [ADM, EST, FUN, SUP],
  [PERMISSIONS.REQUESTS_VIEW]: [ADM, EST, FUN, SUP],
  [PERMISSIONS.HISTORY_VIEW]: [ADM, EST, FUN, SUP],
  [PERMISSIONS.ATTACHMENTS_DOWNLOAD]: [ADM, EST, FUN, SUP],
  [PERMISSIONS.NOTIFICATIONS_OWN]: [ADM, EST, FUN, SUP],
  [PERMISSIONS.PROFILE_OWN]: [ADM, EST, FUN, SUP],
};

describe('matriz de permisos', () => {
  test('la matriz esperada cubre todos los permisos definidos', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.values(PERMISSIONS).sort());
    expect(Object.keys(GRANTS).sort()).toEqual(Object.values(PERMISSIONS).sort());
  });

  const cases = [];
  Object.entries(EXPECTED).forEach(([permission, allowed]) => {
    Object.values(ROLES).forEach((role) => cases.push([role, permission, allowed.includes(role)]));
  });

  test.each(cases)('%s + %s => %s', (role, permission, expected) => {
    expect(can(role, permission)).toBe(expected);
  });

  test('un perfil o permiso desconocido no tiene acceso', () => {
    expect(can('HACKER', PERMISSIONS.USERS_MANAGE)).toBe(false);
    expect(can(ADM, 'permiso:inexistente')).toBe(false);
    expect(can(undefined, undefined)).toBe(false);
  });

  test('solo el administrador gestiona usuarios y ve auditoría', () => {
    [EST, FUN, SUP].forEach((role) => {
      expect(can(role, PERMISSIONS.USERS_MANAGE)).toBe(false);
      expect(can(role, PERMISSIONS.AUDIT_VIEW)).toBe(false);
    });
  });

  test('el estudiante no ve reportes y su alcance de reportes es nulo', () => {
    expect(can(EST, PERMISSIONS.REPORTS_VIEW)).toBe(false);
    expect(reportScopeFor(EST)).toBeNull();
  });

  test('permissionsFor devuelve exactamente los permisos concedidos', () => {
    Object.values(ROLES).forEach((role) => {
      const expected = Object.entries(EXPECTED).filter(([, allowed]) => allowed.includes(role)).map(([p]) => p);
      expect(permissionsFor(role).sort()).toEqual(expected.sort());
    });
    expect(permissionsFor('HACKER')).toEqual([]);
  });

  test('cada perfil tiene un alcance de solicitudes y los desconocidos no', () => {
    Object.values(ROLES).forEach((role) => expect(requestScopeFor(role)).toEqual(expect.any(String)));
    expect(requestScopeFor('HACKER')).toBeNull();
  });
});
