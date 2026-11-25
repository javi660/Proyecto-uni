'use strict';

const { withTransaction } = require('../config/database');
const dependencyRepository = require('../repositories/dependency.repository');
const { recordAuditInTransaction } = require('./audit.service');
const { can, PERMISSIONS } = require('../utils/permissions');
const { notFound, conflict } = require('../utils/errors');
const { changedFields } = require('../utils/diff');

/**
 * Gestión de dependencias. Consultar: todos los perfiles (los no administradores solo ven las
 * activas). Crear, editar y activar/desactivar: administrador (la ruta ya lo exige; aquí se
 * repiten las reglas de negocio). Cada cambio se audita en la misma transacción.
 */

const canSeeInactive = (user) => can(user.rol, PERMISSIONS.DEPENDENCIES_MANAGE);
const duplicateName = () => conflict('Ya existe una dependencia con ese nombre', 'DUPLICATE_NAME');
const entry = (ctx, operacion, id, detalle) => ({
  idUsuario: ctx.user.id, operacion, recurso: 'dependencias', idRecurso: id, resultado: 'EXITO', detalle, ip: ctx.ip,
});

async function list(query, user) {
  const filters = { ...query };
  if (!canSeeInactive(user)) filters.activo = true;
  return dependencyRepository.list(filters);
}

async function get(id, user) {
  const dependency = await dependencyRepository.findById(id);
  if (!dependency || (!dependency.activo && !canSeeInactive(user))) throw notFound('La dependencia no existe');
  return dependency;
}

async function create({ nombre, descripcion }, ctx) {
  if (await dependencyRepository.findByName(nombre)) throw duplicateName();

  return withTransaction(async (client) => {
    const created = await dependencyRepository.create({ nombre, descripcion }, client);
    await recordAuditInTransaction(client, entry(ctx, 'DEPENDENCIA_CREAR', created.id_dependencia, { nombre }));
    return created;
  });
}

async function update(id, { nombre, descripcion }, ctx) {
  const before = await dependencyRepository.findById(id);
  if (!before) throw notFound('La dependencia no existe');
  if (await dependencyRepository.findByName(nombre, id)) throw duplicateName();

  return withTransaction(async (client) => {
    const updated = await dependencyRepository.update(id, { nombre, descripcion }, client);
    const cambios = changedFields(before, updated, ['nombre', 'descripcion']);
    await recordAuditInTransaction(client, entry(ctx, 'DEPENDENCIA_EDITAR', id, { cambios }));
    return updated;
  });
}

async function setStatus(id, activo, ctx) {
  return withTransaction(async (client) => {
    const before = await dependencyRepository.findById(id, client);
    if (!before) throw notFound('La dependencia no existe');

    if (!activo && before.activo) {
      const dependents = await dependencyRepository.countActiveDependents(id, client);
      if (dependents.servicios > 0 || dependents.funcionarios > 0) {
        const error = conflict(
          'No se puede desactivar la dependencia: tiene servicios o funcionarios activos. Desactívalos o trasládalos primero',
          'HAS_ACTIVE_DEPENDENTS',
        );
        error.details = [{ servicios_activos: dependents.servicios, funcionarios_activos: dependents.funcionarios }];
        throw error;
      }
    }

    const updated = await dependencyRepository.setActive(id, activo, client);
    if (before.activo !== activo) {
      await recordAuditInTransaction(client, entry(ctx, 'DEPENDENCIA_ESTADO', id, { activo: { antes: before.activo, despues: activo } }));
    }
    return updated;
  });
}

module.exports = { list, get, create, update, setStatus };
