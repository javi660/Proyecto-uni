'use strict';

const { z } = require('zod');
const { dateField, optionalId } = require('./common.validator');

/** Filtros de GET /api/dashboard y /api/reports/*. `hasta` es inclusivo. */
const reportQuery = z
  .object({
    desde: dateField('La fecha inicial'),
    hasta: dateField('La fecha final'),
    id_dependencia: optionalId,
    id_categoria: optionalId,
    formato: z.enum(['json', 'csv'], { errorMap: () => ({ message: 'El formato debe ser json o csv' }) }).default('json'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.desde && value.hasta) {
      if (value.desde > value.hasta) ctx.addIssue({ code: 'custom', path: ['hasta'], message: 'La fecha final no puede ser anterior a la inicial' });
      else if (Date.parse(value.hasta) - Date.parse(value.desde) > 3 * 366 * 24 * 3600 * 1000) {
        ctx.addIssue({ code: 'custom', path: ['hasta'], message: 'El periodo no puede superar 3 años' });
      }
    }
  })
  .transform((value) => ({
    desde: value.desde, hasta: value.hasta, idDependencia: value.id_dependencia, idCategoria: value.id_categoria, formato: value.formato,
  }));

module.exports = { reportQuery };
