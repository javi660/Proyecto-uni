'use strict';

const { withTransaction } = require('../config/database');
const categoryRepository = require('../repositories/category.repository');
const { recordAuditInTransaction } = require('./audit.service');
const { can, PERMISSIONS } = require('../utils/permissions');
const { notFound, conflict } = require('../utils/errors');
const { changedFields } = require('../utils/diff');

/** Gestión de categorías del catálogo (mismas reglas de visibilidad y auditoría que dependencias). */

const canSeeInactive = (user) => can(user.rol, PERMISSIONS.CATEGORIES_MANAGE);
const duplicateName = () => conflict('Ya existe una categoría con ese nombre', 'DUPLICATE_NAME');
const entry = (ctx, operacion, id, detalle) => ({
  idUsuario: ctx.user.id, operacion, recurso: 'categorias', idRecurso: id, resultado: 'EXITO', detalle, ip: ctx.ip,
});

async function list(query, user) {
  const filters = { ...query };
  if (!canSeeInactive(user)) filters.activo = true;
  return categoryRepository.list(filters);
}

async function get(id, user) {
  const category = await categoryRepository.findById(id);
  if (!category || (!category.activo && !canSeeInactive(user))) throw notFound('La categoría no existe');
  return category;
}

async function create({ nombre, descripcion }, ctx) {
  if (await categoryRepository.findByName(nombre)) throw duplicateName();

  return withTransaction(async (client) => {
    const created = await categoryRepository.create({ nombre, descripcion }, client);
    await recordAuditInTransaction(client, entry(ctx, 'CATEGORIA_CREAR', created.id_categoria, { nombre }));
    return created;
  });
}

async function update(id, { nombre, descripcion }, ctx) {
  const before = await categoryRepository.findById(id);
  if (!before) throw notFound('La categoría no existe');
  if (await categoryRepository.findByName(nombre, id)) throw duplicateName();

  return withTransaction(async (client) => {
    const updated = await categoryRepository.update(id, { nombre, descripcion }, client);
    const cambios = changedFields(before, updated, ['nombre', 'descripcion']);
    await recordAuditInTransaction(client, entry(ctx, 'CATEGORIA_EDITAR', id, { cambios }));
    return updated;
  });
}

async function setStatus(id, activo, ctx) {
  return withTransaction(async (client) => {
    const before = await categoryRepository.findById(id, client);
    if (!before) throw notFound('La categoría no existe');

    if (!activo && before.activo) {
      const activeServices = await categoryRepository.countActiveServices(id, client);
      if (activeServices > 0) {
        const error = conflict('No se puede desactivar la categoría: tiene servicios activos. Desactívalos primero', 'HAS_ACTIVE_DEPENDENTS');
        error.details = [{ servicios_activos: activeServices }];
        throw error;
      }
    }

    const updated = await categoryRepository.setActive(id, activo, client);
    if (before.activo !== activo) {
      await recordAuditInTransaction(client, entry(ctx, 'CATEGORIA_ESTADO', id, { activo: { antes: before.activo, despues: activo } }));
    }
    return updated;
  });
}

module.exports = { list, get, create, update, setStatus };
