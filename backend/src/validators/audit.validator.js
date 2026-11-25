'use strict';

const { z } = require('zod');
const { dateField, optionalId, paginationShape } = require('./common.validator');

const text = (label, max) => z.string().trim().min(1, `${label} no puede estar vacío`).max(max, `${label} es demasiado largo`).optional();

/** Filtros de GET /api/audit. `hasta` es inclusivo y las fechas son en hora de Bogotá. */
const listQuery = z
  .object({
    ...paginationShape,
    operacion: text('La operación', 60),
    recurso: text('El recurso', 60),
    id_recurso: text('El identificador del recurso', 60),
    id_usuario: optionalId,
    resultado: z.enum(['EXITO', 'FALLO'], { errorMap: () => ({ message: 'El resultado debe ser EXITO o FALLO' }) }).optional(),
    desde: dateField('La fecha inicial'),
    hasta: dateField('La fecha final'),
  })
  .strict()
  .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, { path: ['hasta'], message: 'La fecha final no puede ser anterior a la inicial' });

module.exports = { listQuery };
