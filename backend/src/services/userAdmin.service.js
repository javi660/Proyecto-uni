'use strict';

const { withTransaction } = require('../config/database');
const userRepository = require('../repositories/user.repository');
const tokenRepository = require('../repositories/token.repository');
const dependencyRepository = require('../repositories/dependency.repository');
const supervisionRepository = require('../repositories/supervision.repository');
const { recordAuditInTransaction } = require('./audit.service');
const { hashPassword } = require('../utils/password');
const { ROLES } = require('../utils/constants');
const { notFound, conflict, unprocessable } = require('../utils/errors');
const { changedFields } = require('../utils/diff');

/**
 * Administración de usuarios (solo ADMINISTRADOR; la ruta lo exige).
 * Reglas:
 *  - Solo el FUNCIONARIO pertenece a una dependencia (activa); los demás perfiles no la llevan.
 *  - Nadie puede desactivarse a sí mismo ni cambiar su propio perfil (evita bloqueos).
 *  - Siempre debe quedar al menos un administrador activo.
 *  - No se desactiva ni se traslada a un funcionario con asignaciones activas.
 *  - No se quita el perfil SUPERVISOR a quien aún supervisa dependencias.
 *  - Desactivar o restablecer la contraseña revoca todas las sesiones del usuario.
 *  - password_hash nunca sale de aquí; las contraseñas nunca se auditan.
 */

const entry = (ctx, operacion, id, detalle) => ({
  idUsuario: ctx.user.id, operacion, recurso: 'usuarios', idRecurso: id, resultado: 'EXITO', detalle, ip: ctx.ip,
});

async function getOrFail(id, client = null) {
  const user = await userRepository.findPublicById(id, client);
  if (!user) throw notFound('El usuario no existe');
  return user;
}

/** Coherencia perfil–dependencia y dependencia activa. */
async function assertRoleDependency(rol, idDependencia, client = null) {
  if (rol === ROLES.FUNCIONARIO) {
    if (!idDependencia) throw unprocessable('Un funcionario debe pertenecer a una dependencia', 'DEPENDENCY_REQUIRED');
    const dependency = await dependencyRepository.findById(idDependencia, client);
    if (!dependency) throw unprocessable('La dependencia indicada no existe', 'INVALID_DEPENDENCY');
    if (!dependency.activo) throw unprocessable('La dependencia indicada está desactivada', 'DEPENDENCY_INACTIVE');
  } else if (idDependencia) {
    throw unprocessable('Solo los funcionarios pertenecen a una dependencia', 'DEPENDENCY_NOT_ALLOWED');
  }
}

async function assertEmailFree(correo, exceptId = null) {
  const existing = await userRepository.findByEmail(correo);
  if (existing && existing.id_usuario !== exceptId) {
    throw conflict('Ya existe un usuario con ese correo', 'DUPLICATE_EMAIL');
  }
}

/** Debe quedar al menos un administrador activo además de `targetId`. */
async function assertAnotherActiveAdmin(client, targetId) {
  const admins = await userRepository.lockActiveAdminIds(client);
  if (!admins.some((adminId) => adminId !== targetId)) {
    throw conflict('Debe existir al menos un administrador activo', 'LAST_ADMIN');
  }
}

async function assertNoActiveAssignments(client, id, message) {
  const active = await userRepository.countActiveAssignments(id, client);
  if (active > 0) {
    const error = conflict(message, 'HAS_ACTIVE_ASSIGNMENTS');
    error.details = [{ asignaciones_activas: active }];
    throw error;
  }
}

const list = (query) => {
  const { id_dependencia: idDependencia, ...rest } = query;
  return userRepository.list({ ...rest, idDependencia });
};

async function get(id) {
  const user = await getOrFail(id);
  if (user.rol === ROLES.SUPERVISOR) {
    user.dependencias_supervisadas = await supervisionRepository.listBySupervisor(id);
  }
  return user;
}

async function create(body, ctx) {
  await assertRoleDependency(body.rol, body.id_dependencia);
  await assertEmailFree(body.correo);
  const passwordHash = await hashPassword(body.password_inicial);

  return withTransaction(async (client) => {
    const { id_usuario: id } = await userRepository.create(
      {
        nombres: body.nombres,
        apellidos: body.apellidos,
        correo: body.correo,
        passwordHash,
        rol: body.rol,
        idDependencia: body.id_dependencia,
        debeCambiarPassword: true,
      },
      client,
    );
    await recordAuditInTransaction(client, entry(ctx, 'USUARIO_CREAR', id, {
      correo: body.correo, rol: body.rol, id_dependencia: body.id_dependencia,
    }));
    return getOrFail(id, client);
  });
}

async function update(id, body, ctx) {
  const before = await getOrFail(id);
  await assertRoleDependency(body.rol, body.id_dependencia);
  await assertEmailFree(body.correo, id);

  const roleChanged = body.rol !== before.rol;
  const dependencyChanged = (body.id_dependencia ?? null) !== (before.id_dependencia ?? null);

  if (roleChanged && id === ctx.user.id) {
    throw unprocessable('No puedes cambiar tu propio perfil', 'SELF_ROLE_CHANGE');
  }

  return withTransaction(async (client) => {
    if (roleChanged && before.rol === ROLES.ADMINISTRADOR && before.activo) {
      await assertAnotherActiveAdmin(client, id);
    }
    if (roleChanged && before.rol === ROLES.SUPERVISOR) {
      const supervised = await supervisionRepository.countBySupervisor(id, client);
      if (supervised > 0) {
        throw conflict('El usuario supervisa dependencias. Quítale la supervisión antes de cambiar su perfil', 'HAS_SUPERVISION');
      }
    }
    if ((roleChanged || dependencyChanged) && before.rol === ROLES.FUNCIONARIO) {
      await assertNoActiveAssignments(client, id, 'El funcionario tiene asignaciones activas. Reasígnalas antes de cambiar su perfil o dependencia');
    }

    await userRepository.updateProfile(
      id,
      { nombres: body.nombres, apellidos: body.apellidos, correo: body.correo, rol: body.rol, idDependencia: body.id_dependencia },
      client,
    );
    const after = await getOrFail(id, client);
    const cambios = changedFields(before, after, ['nombres', 'apellidos', 'correo', 'rol', 'id_dependencia']);
    await recordAuditInTransaction(client, entry(ctx, 'USUARIO_EDITAR', id, { cambios }));
    return after;
  });
}

async function setStatus(id, activo, ctx) {
  if (!activo && id === ctx.user.id) {
    throw unprocessable('No puedes desactivar tu propia cuenta', 'SELF_DEACTIVATION');
  }

  return withTransaction(async (client) => {
    const before = await getOrFail(id, client);

    if (!activo && before.activo) {
      if (before.rol === ROLES.ADMINISTRADOR) await assertAnotherActiveAdmin(client, id);
      if (before.rol === ROLES.FUNCIONARIO) {
        await assertNoActiveAssignments(client, id, 'El funcionario tiene asignaciones activas. Reasígnalas antes de desactivarlo');
      }
    }
    if (activo && !before.activo && before.id_dependencia) {
      const dependency = await dependencyRepository.findById(before.id_dependencia, client);
      if (!dependency || !dependency.activo) {
        throw unprocessable('La dependencia del usuario está desactivada. Actívala antes de reactivar al usuario', 'DEPENDENCY_INACTIVE');
      }
    }

    await userRepository.setActive(id, activo, client);
    if (!activo) await tokenRepository.revokeAllForUser(id, client); // cierra todas sus sesiones
    if (before.activo !== activo) {
      await recordAuditInTransaction(client, entry(ctx, 'USUARIO_ESTADO', id, { activo: { antes: before.activo, despues: activo } }));
    }
    return getOrFail(id, client);
  });
}

async function resetPassword(id, { password_nueva: newPassword }, ctx) {
  if (id === ctx.user.id) {
    throw unprocessable('Para cambiar tu propia contraseña usa la opción "Cambiar contraseña"', 'USE_OWN_PASSWORD_CHANGE');
  }
  await getOrFail(id);
  const passwordHash = await hashPassword(newPassword);

  await withTransaction(async (client) => {
    await userRepository.resetPassword(id, passwordHash, client);
    await tokenRepository.revokeAllForUser(id, client);
    await recordAuditInTransaction(client, entry(ctx, 'USUARIO_PASSWORD_RESET', id, { cambio_obligatorio: true }));
  });
  return { restablecida: true };
}

async function getSupervision(id) {
  const user = await getOrFail(id);
  return { id_usuario: user.id_usuario, rol: user.rol, dependencias: await supervisionRepository.listBySupervisor(id) };
}

async function setSupervision(id, { ids_dependencias: ids }, ctx) {
  return withTransaction(async (client) => {
    const user = await getOrFail(id, client);
    if (user.rol !== ROLES.SUPERVISOR) {
      throw unprocessable('Solo un usuario con perfil SUPERVISOR puede supervisar dependencias', 'NOT_A_SUPERVISOR');
    }

    const current = await supervisionRepository.listBySupervisor(id, client);
    const currentIds = new Set(current.map((dependency) => dependency.id_dependencia));

    // Las dependencias nuevas deben existir y estar activas; las que ya supervisa se conservan tal cual
    for (const idDependencia of ids) {
      if (currentIds.has(idDependencia)) continue;
      const dependency = await dependencyRepository.findById(idDependencia, client);
      if (!dependency) throw unprocessable(`La dependencia ${idDependencia} no existe`, 'INVALID_DEPENDENCY');
      if (!dependency.activo) throw unprocessable(`La dependencia "${dependency.nombre}" está desactivada`, 'DEPENDENCY_INACTIVE');
    }

    await supervisionRepository.replace(id, ids, client);
    await recordAuditInTransaction(client, entry(ctx, 'USUARIO_SUPERVISION', id, {
      antes: [...currentIds].sort((a, b) => a - b),
      despues: [...ids].sort((a, b) => a - b),
    }));
    return { id_usuario: id, rol: user.rol, dependencias: await supervisionRepository.listBySupervisor(id, client) };
  });
}

module.exports = { list, get, create, update, setStatus, resetPassword, getSupervision, setSupervision };
