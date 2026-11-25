'use strict';

const { z } = require('zod');
const {
  idSchema, paginationShape, activeQuery, searchQuery, requiredText, optionalDescription,
} = require('./common.validator');

/** Dependencias, categorías y servicios. Todos los cuerpos son estrictos (.strict()). */

const listDependenciesQuery = z.object({ ...paginationShape, q: searchQuery, activo: activeQuery }).strict();
const listCategoriesQuery = z.object({ ...paginationShape, q: searchQuery, activo: activeQuery }).strict();

const listServicesQuery = z
  .object({
    ...paginationShape,
    q: searchQuery,
    activo: activeQuery,
    id_categoria: z.coerce.number().int().positive().optional(),
    id_dependencia: z.coerce.number().int().positive().optional(),
  })
  .strict();

const dependencyBodySchema = z
  .object({
    nombre: requiredText('El nombre', 120),
    descripcion: optionalDescription,
  })
  .strict();

const categoryBodySchema = z
  .object({
    nombre: requiredText('El nombre', 100),
    descripcion: optionalDescription,
  })
  .strict();

const serviceBodySchema = z
  .object({
    nombre: requiredText('El nombre', 150),
    descripcion: optionalDescription,
    id_categoria: idSchema('La categoría es obligatoria'),
    id_dependencia: idSchema('La dependencia es obligatoria'),
    sla_horas: z
      .number({ invalid_type_error: 'El tiempo de atención (SLA) debe ser un número' })
      .int('El tiempo de atención (SLA) debe ser un número entero de horas')
      .min(1, 'El tiempo de atención (SLA) debe ser de al menos 1 hora')
      .max(8760, 'El tiempo de atención (SLA) no puede superar 8760 horas (1 año)')
      .default(72),
  })
  .strict();

module.exports = {
  listDependenciesQuery,
  listCategoriesQuery,
  listServicesQuery,
  dependencyBodySchema,
  categoryBodySchema,
  serviceBodySchema,
};
