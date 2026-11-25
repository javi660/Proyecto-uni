'use strict';

/**
 * Compara dos objetos y devuelve solo los campos que cambiaron: { campo: { antes, despues } }.
 * Se usa para el detalle de auditoría (nunca incluir contraseñas ni secretos en `keys`).
 */
function changedFields(before, after, keys) {
  const changes = {};
  keys.forEach((key) => {
    const previous = before[key] ?? null;
    const next = after[key] ?? null;
    if (previous !== next) changes[key] = { antes: previous, despues: next };
  });
  return changes;
}

module.exports = { changedFields };
