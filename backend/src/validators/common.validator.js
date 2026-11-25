'use strict';

const { z } = require('zod');

/** Esquemas reutilizables por todos los módulos. */

/** Identificador en la ruta: /:id */
const idParamSchema = z
  .object({
    id: z.coerce
      .number({ invalid_type_error: 'El identificador no es válido' })
      .int('El identificador no es válido')
      .positive('El identificador no es válido')
      .max(Number.MAX_SAFE_INTEGER, 'El identificador no es válido'),
  })
  .strict();

/** Entero positivo (para ids dentro del cuerpo). */
const idSchema = (message = 'El identificador no es válido') =>
  z
    .number({ required_error: message, invalid_type_error: message })
    .int(message)
    .positive(message)
    .max(Number.MAX_SAFE_INTEGER, message);

/** Fecha AAAA-MM-DD válida (rechaza 2026-02-30), opcional. Para filtros de consulta. */
const dateField = (label) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} debe tener el formato AAAA-MM-DD`)
    .refine((value) => { const d = new Date(`${value}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value; }, `${label} no es una fecha válida`)
    .optional();

/** Filtro por identificador (?id_usuario=3), opcional. */
const optionalId = z.coerce.number().int().positive('El filtro no es válido').max(Number.MAX_SAFE_INTEGER, 'El filtro no es válido').optional();

/** ?page=1&pageSize=20 (por defecto 20, máximo 100). */
const paginationShape = {
  page: z.coerce.number().int().min(1, 'La página debe ser 1 o mayor').default(1),
  pageSize: z.coerce.number().int().min(1, 'El tamaño de página debe ser al menos 1').max(100, 'El tamaño de página máximo es 100').default(20),
};

/** ?activo=true|false (opcional). */
const activeQuery = z
  .enum(['true', 'false'], { errorMap: () => ({ message: 'El filtro "activo" debe ser true o false' }) })
  .transform((value) => value === 'true')
  .optional();

/** ?q=texto (búsqueda libre, recortada). */
const searchQuery = z
  .string()
  .trim()
  .max(100, 'La búsqueda no puede superar 100 caracteres')
  .optional()
  .transform((value) => (value ? value : undefined));

/** Texto obligatorio: recortado, con espacios internos colapsados. */
const requiredText = (label, max) =>
  z
    .string({ required_error: `${label} es obligatorio`, invalid_type_error: `${label} no es válido` })
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1, `${label} es obligatorio`).max(max, `${label} no puede superar ${max} caracteres`));

/** Descripción opcional: vacía o ausente se guarda como null. */
const optionalDescription = z
  .string({ invalid_type_error: 'La descripción no es válida' })
  .trim()
  .max(1000, 'La descripción no puede superar 1000 caracteres')
  .nullish()
  .transform((value) => (value ? value : null));

/** Cuerpo de PATCH /:id/status */
const statusBodySchema = z
  .object({ activo: z.boolean({ required_error: 'Indica el estado (activo)', invalid_type_error: 'El estado debe ser verdadero o falso' }) })
  .strict();

module.exports = { idParamSchema, idSchema, dateField, optionalId, paginationShape, activeQuery, searchQuery, requiredText, optionalDescription, statusBodySchema };
