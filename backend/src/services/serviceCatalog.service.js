'use strict';

const { withTransaction } = require('../config/database');
const serviceRepository = require('../repositories/service.repository');
const categoryRepository = require('../repositories/category.repository');
const dependencyRepository = require('../repositories/dependency.repository');
const { recordAuditInTransaction } = require('./audit.service');
const { can, PERMISSIONS } = require('../utils/permissions');
const { notFound, conflict, unprocessable } = require('../utils/errors');
const { changedFields } = require('../utils/diff');

/**
 * Gestión del catálogo de servicios. Un servicio pertenece a una categoría y a la dependencia
 * que lo atiende, y define su tiempo de atención (SLA) en horas.
 * Los no administradores solo ven los servicios activos (los que pueden solicitarse).
 */

const canSeeInactive = (user) => can(user.rol, PERMISSIONS.SERVICES_MANAGE);
const duplicateName = () => conflict('Ya existe un servicio con ese nombre en la categoría', 'DUPLICATE_NAME');
const entry = (ctx, operacion, id, detalle) => ({
  idUsuario: ctx.user.id, operacion, recurso: 'servicios', idRecurso: id, resultado: 'EXITO', detalle, ip: ctx.ip,
});

const toRepoInput = (body) => ({
  nombre: body.nombre,
  descripcion: body.descripcion,
  idCategoria: body.id_categoria,
  idDependencia: body.id_dependencia,
  slaHoras: body.sla_horas,
});

/** La categoría y la dependencia deben existir y estar activas para ofrecer un servicio. */
async function assertParentsActive(idCategoria, idDependencia, client = null) {
  const [category, dependency] = await Promise.all([
    categoryRepository.findById(idCategoria, client),
    dependencyRepository.findById(idDependencia, client),
  ]);
  if (!category) throw unprocessable('La categoría indicada no existe', 'INVALID_CATEGORY');
  if (!dependency) throw unprocessable('La dependencia indicada no existe', 'INVALID_DEPENDENCY');
  if (!category.activo) throw unprocessable('La categoría indicada está desactivada', 'CATEGORY_INACTIVE');
  if (!dependency.activo) throw unprocessable('La dependencia indicada está desactivada', 'DEPENDENCY_INACTIVE');
}

async function list(query, user) {
  const { id_categoria: idCategoria, id_dependencia: idDependencia, ...rest } = query;
  const filters = { ...rest, idCategoria, idDependencia };
  if (!canSeeInactive(user)) filters.activo = true;
  return serviceRepository.list(filters);
}

async function get(id, user) {
  const service = await serviceRepository.findById(id);
  if (!service || (!service.activo && !canSeeInactive(user))) throw notFound('El servicio no existe');
  return service;
}

async function create(body, ctx) {
  const input = toRepoInput(body);
  await assertParentsActive(input.idCategoria, input.idDependencia);
  if (await serviceRepository.findByNameInCategory(input.nombre, input.idCategoria)) throw duplicateName();

  return withTransaction(async (client) => {
    const id = await serviceRepository.create(input, client);
    await recordAuditInTransaction(client, entry(ctx, 'SERVICIO_CREAR', id, {
      nombre: input.nombre, id_categoria: input.idCategoria, id_dependencia: input.idDependencia, sla_horas: input.slaHoras,
    }));
    return serviceRepository.findById(id, client);
  });
}

async function update(id, body, ctx) {
  const before = await serviceRepository.findById(id);
  if (!before) throw notFound('El servicio no existe');

  const input = toRepoInput(body);
  // Solo se exige que el padre esté activo si cambia (un servicio existente puede conservar el suyo)
  if (input.idCategoria !== before.id_categoria || input.idDependencia !== before.id_dependencia) {
    await assertParentsActive(input.idCategoria, input.idDependencia);
  }
  if (await serviceRepository.findByNameInCategory(input.nombre, input.idCategoria, id)) throw duplicateName();

  return withTransaction(async (client) => {
    await serviceRepository.update(id, input, client);
    const after = await serviceRepository.findById(id, client);
    const cambios = changedFields(before, after, ['nombre', 'descripcion', 'id_categoria', 'id_dependencia', 'sla_horas']);
    await recordAuditInTransaction(client, entry(ctx, 'SERVICIO_EDITAR', id, { cambios }));
    return after;
  });
}

async function setStatus(id, activo, ctx) {
  return withTransaction(async (client) => {
    const before = await serviceRepository.findById(id, client);
    if (!before) throw notFound('El servicio no existe');

    // Para activar un servicio, su categoría y su dependencia deben estar activas
    if (activo && !before.activo) await assertParentsActive(before.id_categoria, before.id_dependencia, client);

    await serviceRepository.setActive(id, activo, client);
    if (before.activo !== activo) {
      await recordAuditInTransaction(client, entry(ctx, 'SERVICIO_ESTADO', id, { activo: { antes: before.activo, despues: activo } }));
    }
    return serviceRepository.findById(id, client);
  });
}

module.exports = { list, get, create, update, setStatus };
