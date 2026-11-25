'use strict';

const { ROLES } = require('./constants');

/**
 * Matriz de permisos por perfil (DECISIONES.md, sección 3).
 *
 * Un permiso responde "¿este PERFIL puede realizar esta ACCIÓN?". Cuando la respuesta
 * depende además del recurso (solo las propias, solo las asignadas, solo su ámbito),
 * el alcance se obtiene con requestScopeFor() / reportScopeFor() y lo aplica el servicio
 * consultando la base de datos. El rol siempre sale de la identidad autenticada.
 */

const { ADMINISTRADOR: ADMIN, ESTUDIANTE: EST, FUNCIONARIO: FUNC, SUPERVISOR: SUP } = ROLES;
const ALL_ROLES = [ADMIN, EST, FUNC, SUP];

const PERMISSIONS = Object.freeze({
  USERS_MANAGE: 'users:manage',
  CATEGORIES_MANAGE: 'categories:manage',
  SERVICES_MANAGE: 'services:manage',
  DEPENDENCIES_MANAGE: 'dependencies:manage',
  CATALOG_VIEW: 'catalog:view',
  REQUESTS_CREATE: 'requests:create',
  REQUESTS_VIEW: 'requests:view',
  REQUESTS_ASSIGN: 'requests:assign',
  REQUESTS_REJECT: 'requests:reject',
  REQUESTS_ATTEND: 'requests:attend',
  REQUESTS_CLOSE: 'requests:close',
  REQUESTS_REOPEN: 'requests:reopen',
  REQUESTS_CHANGE_PRIORITY: 'requests:change-priority',
  HISTORY_VIEW: 'history:view',
  RESPONSES_CREATE: 'responses:create',
  RESPONSES_VIEW_INTERNAL: 'responses:view-internal',
  ATTACHMENTS_UPLOAD: 'attachments:upload',
  ATTACHMENTS_DOWNLOAD: 'attachments:download',
  OFFICIALS_LIST: 'officials:list',
  REPORTS_VIEW: 'reports:view',
  AUDIT_VIEW: 'audit:view',
  NOTIFICATIONS_OWN: 'notifications:own',
  PROFILE_OWN: 'profile:own',
});

/** Perfiles que tienen cada permiso. */
const GRANTS = Object.freeze({
  [PERMISSIONS.USERS_MANAGE]: [ADMIN],
  [PERMISSIONS.CATEGORIES_MANAGE]: [ADMIN],
  [PERMISSIONS.SERVICES_MANAGE]: [ADMIN],
  [PERMISSIONS.DEPENDENCIES_MANAGE]: [ADMIN],
  [PERMISSIONS.CATALOG_VIEW]: ALL_ROLES,
  [PERMISSIONS.REQUESTS_CREATE]: [EST],
  [PERMISSIONS.REQUESTS_VIEW]: ALL_ROLES, // alcance: requestScopeFor()
  [PERMISSIONS.REQUESTS_ASSIGN]: [ADMIN, SUP], // el supervisor solo en su ámbito
  [PERMISSIONS.REQUESTS_REJECT]: [ADMIN, SUP], // el supervisor solo en su ámbito
  [PERMISSIONS.REQUESTS_ATTEND]: [FUNC], // solo solicitudes asignadas a él
  [PERMISSIONS.REQUESTS_CLOSE]: [ADMIN, EST, SUP], // el estudiante solo la propia
  [PERMISSIONS.REQUESTS_REOPEN]: [EST], // solo la propia
  [PERMISSIONS.REQUESTS_CHANGE_PRIORITY]: [ADMIN, SUP],
  [PERMISSIONS.HISTORY_VIEW]: ALL_ROLES, // alcance: requestScopeFor()
  [PERMISSIONS.RESPONSES_CREATE]: [FUNC],
  [PERMISSIONS.RESPONSES_VIEW_INTERNAL]: [ADMIN, FUNC, SUP],
  [PERMISSIONS.ATTACHMENTS_UPLOAD]: [EST, FUNC],
  [PERMISSIONS.ATTACHMENTS_DOWNLOAD]: ALL_ROLES, // quien pueda ver la solicitud
  [PERMISSIONS.OFFICIALS_LIST]: [ADMIN, SUP],
  [PERMISSIONS.REPORTS_VIEW]: [ADMIN, FUNC, SUP], // alcance: reportScopeFor()
  [PERMISSIONS.AUDIT_VIEW]: [ADMIN],
  [PERMISSIONS.NOTIFICATIONS_OWN]: ALL_ROLES,
  [PERMISSIONS.PROFILE_OWN]: ALL_ROLES,
});

/** Alcance de consulta de solicitudes e historial por perfil. */
const REQUEST_SCOPES = Object.freeze({
  ALL: 'ALL', // todas
  OWN: 'OWN', // las que registró el usuario
  ASSIGNED: 'ASSIGNED', // las asignadas al usuario
  SUPERVISED: 'SUPERVISED', // las de las dependencias que supervisa
});

const REQUEST_SCOPE_BY_ROLE = Object.freeze({
  [ADMIN]: REQUEST_SCOPES.ALL,
  [EST]: REQUEST_SCOPES.OWN,
  [FUNC]: REQUEST_SCOPES.ASSIGNED,
  [SUP]: REQUEST_SCOPES.SUPERVISED,
});

/** Alcance de los reportes: el estudiante no tiene reportes (null). El funcionario solo sus cifras. */
const REPORT_SCOPE_BY_ROLE = Object.freeze({
  [ADMIN]: REQUEST_SCOPES.ALL,
  [EST]: null,
  [FUNC]: REQUEST_SCOPES.ASSIGNED,
  [SUP]: REQUEST_SCOPES.SUPERVISED,
});

/**
 * @param {string} role Perfil del usuario autenticado
 * @param {string} permission Uno de PERMISSIONS
 * @returns {boolean}
 */
function can(role, permission) {
  const roles = GRANTS[permission];
  return Array.isArray(roles) && roles.includes(role);
}

/** @param {string} role @returns {string[]} permisos del perfil */
function permissionsFor(role) {
  return Object.values(PERMISSIONS).filter((permission) => can(role, permission));
}

/** @returns {string|null} uno de REQUEST_SCOPES, o null si el perfil no existe */
function requestScopeFor(role) {
  return REQUEST_SCOPE_BY_ROLE[role] ?? null;
}

/** @returns {string|null} uno de REQUEST_SCOPES, o null si el perfil no tiene reportes */
function reportScopeFor(role) {
  return REPORT_SCOPE_BY_ROLE[role] ?? null;
}

module.exports = {
  PERMISSIONS,
  GRANTS,
  REQUEST_SCOPES,
  can,
  permissionsFor,
  requestScopeFor,
  reportScopeFor,
};
