'use strict';

const { badRequest } = require('../utils/errors');

/**
 * Middleware de validación con Zod.
 *
 * Uso:
 *   router.post('/', validate({ body: createSchema }), controller.create);
 *   router.get('/:id', validate({ params: idParamSchema, query: listQuerySchema }), controller.get);
 *
 * Los valores ya validados (y transformados por Zod) quedan en `req.validated`:
 *   req.validated.body, req.validated.query, req.validated.params
 *
 * Además, `req.body` se reemplaza por la versión validada. `req.query` y `req.params`
 * NO se reemplazan (en Express son de solo lectura en algunos casos): usa `req.validated`.
 *
 * @param {{body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny}} schemas
 */
function validate(schemas = {}) {
  return (req, res, next) => {
    const details = [];
    const validated = {};

    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({
            in: part,
            field: issue.path.join('.'),
            message: issue.message,
          });
        }
      }
    }

    if (details.length > 0) {
      return next(badRequest('Los datos enviados no son válidos', details));
    }

    req.validated = validated;
    if (validated.body !== undefined) {
      req.body = validated.body;
    }
    return next();
  };
}

module.exports = { validate };
