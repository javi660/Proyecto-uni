'use strict';

const multer = require('multer');
const { AppError } = require('../utils/errors');
const { MAX_FILE_BYTES } = require('../utils/fileSignature');

/**
 * Recibe UN archivo en el campo `archivo` (multipart/form-data) en memoria.
 * El contenido se valida después (extensión, MIME y firma real) en el servicio.
 */
const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0, parts: 2 },
}).single('archivo');

function receiveAttachment(req, res, next) {
  parser(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'FILE_TOO_LARGE', 'El archivo supera el tamaño máximo de 5 MB'));
      return next(new AppError(400, 'FILE_INVALID', 'Envía un único archivo en el campo "archivo"'));
    }
    if (error) return next(error);
    if (!req.file) return next(new AppError(400, 'FILE_REQUIRED', 'Selecciona un archivo para adjuntar'));
    return next();
  });
}

module.exports = { receiveAttachment };
