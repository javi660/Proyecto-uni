'use strict';

/**
 * Validación de adjuntos por contenido real (magic bytes), no solo por extensión o MIME declarado.
 * Tipos permitidos (DECISIONES §9): PDF, PNG, JPG/JPEG y DOCX.
 */

const MIME = Object.freeze({
  PDF: 'application/pdf',
  PNG: 'image/png',
  JPEG: 'image/jpeg',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});

/** extensión (minúscula, sin punto) → MIME permitido */
const EXTENSION_TO_MIME = Object.freeze({
  pdf: MIME.PDF,
  png: MIME.PNG,
  jpg: MIME.JPEG,
  jpeg: MIME.JPEG,
  docx: MIME.DOCX,
});

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_REQUEST = 3;

const startsWith = (buffer, bytes) => buffer.length >= bytes.length && bytes.every((byte, i) => buffer[i] === byte);

/**
 * Detecta el tipo real del contenido. Devuelve el MIME permitido o null.
 * DOCX es un ZIP (PK\x03\x04) que debe contener `[Content_Types].xml` y `word/`.
 * @param {Buffer} buffer
 * @returns {string|null}
 */
function detectMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null;
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return MIME.PDF; // %PDF-
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return MIME.PNG;
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return MIME.JPEG;
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    const text = buffer.toString('latin1');
    if (text.includes('[Content_Types].xml') && text.includes('word/')) return MIME.DOCX;
  }
  return null;
}

/** @returns {string} extensión en minúscula sin punto ('' si no tiene) */
function extensionOf(filename) {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(String(filename || ''));
  return match ? match[1].toLowerCase() : '';
}

/**
 * Nombre original saneado para guardarlo como dato: sin rutas, sin caracteres de control,
 * máximo 255 caracteres. Nunca se usa para construir rutas en disco o en Storage.
 */
function sanitizeOriginalName(filename) {
  const base = String(filename || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '')
    .trim();
  return base.slice(-255) || 'archivo';
}

/**
 * Valida un archivo subido. Lanza `{ code, message }` si no cumple.
 * @param {{originalname: string, mimetype: string, buffer: Buffer, size: number}} file
 * @returns {{mime: string, extension: string, originalName: string}}
 */
function inspectUpload(file) {
  const originalName = sanitizeOriginalName(file.originalname);
  const extension = extensionOf(originalName);
  const byExtension = EXTENSION_TO_MIME[extension];
  if (!byExtension) {
    return { error: { code: 'FILE_TYPE_NOT_ALLOWED', message: 'Solo se permiten archivos PDF, PNG, JPG o DOCX' } };
  }
  if (!file.size || file.size <= 0) {
    return { error: { code: 'FILE_EMPTY', message: 'El archivo está vacío' } };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { error: { code: 'FILE_TOO_LARGE', message: 'El archivo supera el tamaño máximo de 5 MB' } };
  }
  const detected = detectMime(file.buffer);
  if (detected !== byExtension || file.mimetype !== byExtension) {
    return { error: { code: 'FILE_CONTENT_MISMATCH', message: 'El contenido del archivo no corresponde a su tipo o extensión' } };
  }
  return { mime: detected, extension: extension === 'jpeg' ? 'jpg' : extension, originalName };
}

module.exports = {
  MIME, EXTENSION_TO_MIME, MAX_FILE_BYTES, MAX_ATTACHMENTS_PER_REQUEST,
  detectMime, extensionOf, sanitizeOriginalName, inspectUpload,
};
