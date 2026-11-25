/** Reglas de adjuntos en el cliente (espejo de DECISIONES §9; el servidor es quien decide). */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 3;
export const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'docx'];
export const ACCEPT_ATTRIBUTE = '.pdf,.png,.jpg,.jpeg,.docx';

/** Estados en los que la solicitud ya no admite cambios (ni adjuntos). */
export const FINAL_STATES = ['CERRADA', 'RECHAZADA'];

const extensionOf = (name) => (/\.([A-Za-z0-9]{1,8})$/.exec(name || '')?.[1] ?? '').toLowerCase();

/** @returns {string} "1,2 MB", "340 KB", "12 B" */
export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Valida un archivo elegido por el usuario antes de enviarlo.
 * @param {File} file
 * @param {File[]} [already] archivos ya elegidos (para detectar repetidos)
 * @returns {string|null} mensaje de error o null si es válido
 */
export function validateFile(file, already = []) {
  if (!ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) {
    return `"${file.name}": solo se permiten archivos PDF, PNG, JPG o DOCX`;
  }
  if (file.size === 0) return `"${file.name}": el archivo está vacío`;
  if (file.size > MAX_FILE_BYTES) return `"${file.name}": supera el tamaño máximo de 5 MB`;
  if (already.some((other) => other.name === file.name && other.size === file.size)) {
    return `"${file.name}": ya está en la lista`;
  }
  return null;
}

/**
 * ¿Puede el usuario adjuntar archivos a esta solicitud? Es solo presentación; el servidor decide.
 * Estudiante propietario o funcionario asignado, mientras no esté CERRADA ni RECHAZADA y haya cupo.
 */
export function canUploadTo(request, user) {
  if (!request || !user || FINAL_STATES.includes(request.estado)) return false;
  if (Number(request.total_adjuntos) >= MAX_ATTACHMENTS) return false;
  if (user.rol === 'ESTUDIANTE') return request.id_estudiante === user.id_usuario;
  if (user.rol === 'FUNCIONARIO') return request.id_funcionario === user.id_usuario;
  return false;
}
