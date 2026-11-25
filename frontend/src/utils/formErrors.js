/**
 * Pasa los errores de validación del servidor (400 con details [{field, message}]) a los
 * campos del formulario. Devuelve true si al menos uno se asignó a un campo.
 *
 * @param {import('../services/api.js').ApiError} error
 * @param {(name: string, error: {type: string, message: string}) => void} setError  de react-hook-form
 * @param {string[]} fields  nombres de campo válidos del formulario
 * @param {Record<string, string>} [aliases]  campo del servidor -> campo del formulario
 */
export function applyServerErrors(error, setError, fields, aliases = {}) {
  if (!error || error.status !== 400 || !Array.isArray(error.details)) return false;
  let applied = false;
  error.details.forEach((detail) => {
    const name = aliases[detail.field] ?? detail.field;
    if (fields.includes(name)) {
      setError(name, { type: 'server', message: detail.message });
      applied = true;
    }
  });
  return applied;
}

/** Mensaje legible de cualquier error (ApiError o desconocido). */
export function errorMessage(error, fallback = 'No fue posible completar la operación') {
  return error?.message || fallback;
}
