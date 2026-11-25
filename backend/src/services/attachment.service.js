'use strict';

const crypto = require('crypto');
const { withTransaction } = require('../config/database');
const requestRepository = require('../repositories/request.repository');
const storage = require('./storage.service');
const { recordAuditInTransaction, recordAudit } = require('./audit.service');
const { AppError, notFound, forbidden, conflict } = require('../utils/errors');
const { ROLES } = require('../utils/constants');
const { requestScopeFor } = require('../utils/permissions');
const { inspectUpload, MAX_ATTACHMENTS_PER_REQUEST } = require('../utils/fileSignature');
const logger = require('../utils/logger');

const NOT_FOUND_MESSAGE = 'La solicitud no existe o no tienes acceso a ella';
const FILE_ERROR_STATUS = { FILE_TYPE_NOT_ALLOWED: 415, FILE_TOO_LARGE: 413, FILE_EMPTY: 400, FILE_CONTENT_MISMATCH: 400 };
const FINAL_STATES = ['CERRADA', 'RECHAZADA'];

async function assertVisible(idSolicitud, user) {
  const row = await requestRepository.findVisibleById(idSolicitud, requestScopeFor(user.rol), user);
  if (!row) throw notFound(NOT_FOUND_MESSAGE);
  return row;
}

async function list(idSolicitud, user) {
  await assertVisible(idSolicitud, user);
  return requestRepository.listAttachments(idSolicitud);
}

/**
 * Sube un adjunto (DECISIONES §9): estudiante propietario o funcionario con asignación activa,
 * mientras la solicitud no esté CERRADA ni RECHAZADA; máximo 3 por solicitud.
 */
async function upload(idSolicitud, file, { user, ip }) {
  await assertVisible(idSolicitud, user);

  const inspected = inspectUpload(file);
  if (inspected.error) {
    throw new AppError(FILE_ERROR_STATUS[inspected.error.code] || 400, inspected.error.code, inspected.error.message);
  }

  const id = crypto.randomUUID();
  const storedName = `${id}.${inspected.extension}`;
  const key = `solicitudes/${idSolicitud}/${storedName}`;
  let stored = false;

  try {
    return await withTransaction(async (client) => {
      const locked = await requestRepository.lockById(idSolicitud, client);
      if (!locked) throw notFound(NOT_FOUND_MESSAGE);

      const isOwner = user.rol === ROLES.ESTUDIANTE && locked.id_estudiante === user.id;
      const isAssigned = user.rol === ROLES.FUNCIONARIO && locked.id_funcionario_activo === user.id;
      if (!isOwner && !isAssigned) throw forbidden('No puedes adjuntar archivos a esta solicitud');
      if (FINAL_STATES.includes(locked.estado)) {
        throw conflict('La solicitud ya no admite nuevos adjuntos', 'REQUEST_CLOSED');
      }
      if ((await requestRepository.countAttachments(idSolicitud, client)) >= MAX_ATTACHMENTS_PER_REQUEST) {
        throw conflict(`Una solicitud admite máximo ${MAX_ATTACHMENTS_PER_REQUEST} adjuntos`, 'ATTACHMENT_LIMIT');
      }

      await storage.put(key, file.buffer, inspected.mime);
      stored = true;

      const idAdjunto = await requestRepository.insertAttachment({
        idSolicitud, idUsuario: user.id, nombreOriginal: inspected.originalName, nombreAlmacenado: storedName,
        rutaArchivo: key, tipoMime: inspected.mime, tamanoBytes: file.size,
      }, client);

      await recordAuditInTransaction(client, {
        idUsuario: user.id, operacion: 'ADJUNTO_SUBIDO', recurso: 'adjuntos', idRecurso: idAdjunto, resultado: 'EXITO',
        detalle: { id_solicitud: idSolicitud, tipo_mime: inspected.mime, tamano_bytes: file.size }, ip,
      });
      return requestRepository.findAttachmentPublic(idAdjunto, client);
    });
  } catch (error) {
    if (stored) {
      // Compensación: no dejar un objeto huérfano si la base de datos rechazó o revirtió la operación.
      await storage.remove(key).catch((removeError) => logger.error('No se pudo limpiar un adjunto huérfano', { key, code: removeError.code }));
    }
    throw error;
  }
}

/** Devuelve el contenido para la descarga; solo quien puede ver la solicitud. */
async function download(idAdjunto, { user, ip }) {
  const attachment = await requestRepository.findAttachmentById(idAdjunto);
  if (!attachment) throw notFound('El adjunto no existe o no tienes acceso a él');
  const visible = await requestRepository.findVisibleById(attachment.id_solicitud, requestScopeFor(user.rol), user);
  if (!visible) throw notFound('El adjunto no existe o no tienes acceso a él');

  let buffer;
  try {
    buffer = await storage.get(attachment.ruta_archivo);
  } catch (error) {
    if (error.code === 'STORAGE_NOT_FOUND') throw notFound('El archivo ya no está disponible');
    throw error;
  }

  await recordAudit({
    idUsuario: user.id, operacion: 'ADJUNTO_DESCARGADO', recurso: 'adjuntos', idRecurso: idAdjunto, resultado: 'EXITO',
    detalle: { id_solicitud: attachment.id_solicitud }, ip,
  });
  return { buffer, mime: attachment.tipo_mime, filename: attachment.nombre_original };
}

module.exports = { list, upload, download };
