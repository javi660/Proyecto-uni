'use strict';

const { z } = require('zod');
const { paginationShape } = require('./common.validator');

/** Filtros de GET /api/notifications: ?leida=true|false&page&pageSize */
const listQuery = z
  .object({
    ...paginationShape,
    leida: z
      .enum(['true', 'false'], { errorMap: () => ({ message: 'El filtro "leida" debe ser true o false' }) })
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

module.exports = { listQuery };
