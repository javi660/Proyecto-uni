'use strict';

const { z } = require('zod');
const { idSchema, paginationShape, searchQuery, requiredText, dateField, optionalId } = require('./common.validator');

const ESTADOS = ['REGISTRADA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA', 'RECHAZADA', 'REABIERTA'];
const PRIORIDADES = ['BAJA', 'NORMAL', 'ALTA', 'URGENTE'];

/** Cuerpo de POST /api/requests. El estado, el propietario y la prioridad los fija el backend. */
const createRequestBody = z
  .object({
    id_servicio: idSchema('Selecciona un servicio'),
    asunto: requiredText('El asunto', 180),
    descripcion: z
      .string({ required_error: 'La descripción es obligatoria', invalid_type_error: 'La descripción no es válida' })
      .transform((value) => value.trim())
      .pipe(z.string().min(1, 'La descripción es obligatoria').max(4000, 'La descripción no puede superar 4000 caracteres')),
  })
  .strict();

/** Filtros de GET /api/requests (y /my). `hasta` es inclusivo: se traduce al día siguiente. */
const listRequestsQuery = z
  .object({
    ...paginationShape,
    q: searchQuery,
    estado: z.enum(ESTADOS, { errorMap: () => ({ message: 'El estado no es válido' }) }).optional(),
    prioridad: z.enum(PRIORIDADES, { errorMap: () => ({ message: 'La prioridad no es válida' }) }).optional(),
    id_servicio: optionalId,
    id_categoria: optionalId,
    id_dependencia: optionalId,
    desde: dateField('La fecha inicial'),
    hasta: dateField('La fecha final'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.desde && value.hasta && value.desde > value.hasta) {
      ctx.addIssue({ code: 'custom', path: ['hasta'], message: 'La fecha final no puede ser anterior a la inicial' });
    }
  })
  .transform((value) => ({
    page: value.page,
    pageSize: value.pageSize,
    q: value.q,
    estado: value.estado,
    prioridad: value.prioridad,
    idServicio: value.id_servicio,
    idCategoria: value.id_categoria,
    idDependencia: value.id_dependencia,
    desde: value.desde ? `${value.desde}T00:00:00-05:00` : undefined, // America/Bogota
    hasta: value.hasta ? new Date(Date.parse(`${value.hasta}T00:00:00-05:00`) + 24 * 3600 * 1000).toISOString() : undefined,
  }));

module.exports = { createRequestBody, listRequestsQuery, ESTADOS, PRIORIDADES };
