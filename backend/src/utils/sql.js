'use strict';

/**
 * Utilidades para construir consultas SQL parametrizadas con filtros opcionales.
 * Los VALORES siempre van como parámetros ($1, $2…); nunca se concatenan en el texto SQL.
 */

/** Escapa los comodines de LIKE (% _ \) para que la búsqueda trate el texto literalmente. */
function escapeLike(text) {
  return String(text).replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Acumula condiciones WHERE con sus parámetros.
 *
 *   const where = createWhere();
 *   where.add('activo = $?', true);          // "$?" se reemplaza por el número de parámetro
 *   where.add('(a ILIKE $? OR b ILIKE $?)', pattern); // un mismo valor puede usarse varias veces
 *   const { clause, params } = where.build();
 */
function createWhere() {
  const conditions = [];
  const params = [];

  return {
    add(template, value) {
      params.push(value);
      const position = params.length;
      conditions.push(template.replace(/\$\?/g, `$${position}`));
    },
    addRaw(condition) {
      conditions.push(condition);
    },
    build() {
      return { clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params: [...params] };
    },
  };
}

/** Convierte page/pageSize en LIMIT/OFFSET. */
function toLimitOffset({ page, pageSize }) {
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

module.exports = { escapeLike, createWhere, toLimitOffset };
