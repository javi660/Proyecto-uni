'use strict';

const { z } = require('zod');
const { STATUS_TARGETS, TARGETS } = require('../utils/stateMachine');

const PRIORIDADES = ['BAJA', 'NORMAL', 'ALTA', 'URGENTE'];

const optionalText = (max, label) =>
  z
    .string({ invalid_type_error: `${label} no es válida` })
    .transform((value) => value.trim())
    .pipe(z.string().max(max, `${label} no puede superar ${max} caracteres`))
    .nullish()
    .transform((value) => (value ? value : null));

/** Cuerpo de PATCH /api/requests/:id/status. Rechazar y reabrir exigen motivo. */
const statusBody = z
  .object({
    estado: z.enum(STATUS_TARGETS, { errorMap: () => ({ message: `El estado debe ser uno de: ${STATUS_TARGETS.join(', ')}` }) }),
    observacion: optionalText(1000, 'La observación'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (TARGETS[value.estado]?.reasonRequired && !value.observacion) {
      ctx.addIssue({ code: 'custom', path: ['observacion'], message: 'El motivo es obligatorio' });
    }
  });

/** Cuerpo de PATCH /api/requests/:id/priority. */
const priorityBody = z
  .object({ prioridad: z.enum(PRIORIDADES, { errorMap: () => ({ message: 'La prioridad no es válida' }) }) })
  .strict();

/** Cuerpo de POST /api/requests/:id/responses. Por defecto la respuesta es pública. */
const responseBody = z
  .object({
    contenido: z
      .string({ required_error: 'La respuesta es obligatoria', invalid_type_error: 'La respuesta no es válida' })
      .transform((value) => value.trim())
      .pipe(z.string().min(1, 'La respuesta es obligatoria').max(4000, 'La respuesta no puede superar 4000 caracteres')),
    visibilidad: z.enum(['PUBLICA', 'INTERNA'], { errorMap: () => ({ message: 'La visibilidad no es válida' }) }).default('PUBLICA'),
  })
  .strict();

module.exports = { statusBody, priorityBody, responseBody, PRIORIDADES };
