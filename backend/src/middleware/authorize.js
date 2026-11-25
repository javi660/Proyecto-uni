'use strict';

const { can } = require('../utils/permissions');
const { forbidden, unauthorized } = require('../utils/errors');

/**
 * Autorización por perfil. Se usa SIEMPRE después de authenticate(), porque el perfil
 * sale de req.user (cargado de la base de datos), nunca de lo que envíe el navegador.
 *
 *   router.get('/users', authenticate(), authorize(ROLES.ADMINISTRADOR), ...)
 *
 * Responde 401 si no hay usuario autenticado y 403 si el perfil no está permitido.
 * Esto controla el ACCESO A LA RUTA; el alcance del recurso (propias, asignadas, ámbito)
 * lo verifica además cada servicio consultando la base de datos.
 *
 * @param {...string} roles Perfiles permitidos (valores de ROLES)
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.rol)) return next(forbidden());
    return next();
  };
}

/**
 * Autorización por permiso (matriz de utils/permissions.js).
 *
 *   router.post('/users', authenticate(), requirePermission(PERMISSIONS.USERS_MANAGE), ...)
 *
 * @param {string} permission Uno de PERMISSIONS
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!can(req.user.rol, permission)) return next(forbidden());
    return next();
  };
}

module.exports = { authorize, requirePermission };
