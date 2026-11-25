'use strict';

const { z } = require('zod');
const { idSchema, paginationShape, searchQuery } = require('./common.validator');

/** Cuerpo de POST /api/requests/:id/assignment (asigna o reasigna). */
const assignBody = z
  .object({
    id_funcionario: idSchema('Selecciona un funcionario'),
    observacion: z
      .string({ invalid_type_error: 'La observación no es válida' })
      .transform((value) => value.trim())
      .pipe(z.string().max(500, 'La observación no puede superar 500 caracteres'))
      .nullish()
      .transform((value) => (value ? value : null)),
  })
  .strict();

/** Filtros de GET /api/officials. */
const officialsQuery = z
  .object({
    ...paginationShape,
    q: searchQuery,
    id_dependencia: z.coerce.number().int().positive('La dependencia no es válida').optional(),
  })
  .strict()
  .transform((value) => ({ page: value.page, pageSize: value.pageSize, q: value.q, idDependencia: value.id_dependencia }));

module.exports = { assignBody, officialsQuery };
