'use strict';

const { withTransaction } = require('../config/database');
const requestRepository = require('../repositories/request.repository');
const trackingRepository = require('../repositories/tracking.repository');
const notificationRepository = require('../repositories/notification.repository');
const requestService = require('./request.service');
const { recordAuditInTransaction } = require('./audit.service');
const { AppError, notFound, forbidden, conflict } = require('../utils/errors');
const { ROLES } = require('../utils/constants');
const { PERMISSIONS, REQUEST_SCOPES, can, requestScopeFor } = require('../utils/permissions');
const { TARGETS, RESPONSE_STATES, isFinal, canTransition } = require('../utils/stateMachine');

const NOT_FOUND_MESSAGE = 'La solicitud no existe o no tienes acceso a ella';
/** Etiqueta que ve el estudiante cuando actuó un supervisor o un administrador (no se revelan sus nombres). */
const MANAGEMENT_LABEL = 'Gestión de solicitudes';

async function loadVisible(idSolicitud, user) {
  const row = await requestRepository.findVisibleById(idSolicitud, requestScopeFor(user.rol), user);
  if (!row) throw notFound(NOT_FOUND_MESSAGE);
  return row;
}

const lockOpen = async (idSolicitud, client) => {
  const locked = await requestRepository.lockById(idSolicitud, client);
  if (!locked) throw notFound(NOT_FOUND_MESSAGE);
  if (isFinal(locked.estado)) throw conflict('La solicitud ya está en un estado final y no admite cambios', 'REQUEST_CLOSED');
  return locked;
};

/** Mensajes de notificación por evento. */
function notificationsFor({ target, request, locked, actorId, reason }) {
  const code = request.codigo;
  const to = (idUsuario, titulo, mensaje) => ({ idUsuario, idSolicitud: request.id_solicitud, tipo: TARGETS[target].notification, titulo, mensaje });
  const student = request.id_estudiante;
  const official = locked.id_funcionario_activo;
  switch (target) {
    case 'EN_PROCESO':
      return [to(student, 'Iniciamos la atención de tu solicitud', `La solicitud ${code} ya está en proceso.`)];
    case 'RESUELTA':
      return [to(student, 'Tu solicitud fue resuelta', `La solicitud ${code} fue resuelta. Revisa la respuesta y ciérrala o reábrela si no quedó resuelta.`)];
    case 'CERRADA':
      return [
        to(student, 'Tu solicitud fue cerrada', `La solicitud ${code} fue cerrada.`),
        ...(official ? [to(official, 'Una solicitud a tu cargo fue cerrada', `La solicitud ${code} fue cerrada.`)] : []),
      ].filter((n) => n.idUsuario !== actorId);
    case 'RECHAZADA':
      return [to(student, 'Tu solicitud fue rechazada', `La solicitud ${code} fue rechazada. Motivo: ${reason}`)];
    default:
      return [];
  }
}

/**
 * Cambia el estado de una solicitud (iniciar/retomar, resolver, cerrar, reabrir, rechazar) en una sola transacción:
 * valida la transición y quién puede hacerla, actualiza fechas derivadas, e inserta historial, auditoría y notificaciones.
 */
async function changeStatus(idSolicitud, { estado: target, observacion }, { user, ip }) {
  const rule = TARGETS[target];
  if (!rule) throw new AppError(400, 'VALIDATION_ERROR', 'El estado solicitado no es válido');
  if (!can(user.rol, rule.permission)) throw forbidden();

  const request = await loadVisible(idSolicitud, user);

  await withTransaction(async (client) => {
    const locked = await lockOpen(idSolicitud, client);
    const from = locked.estado;

    if (!canTransition(from, target)) {
      throw conflict(`No se puede pasar de ${from} a ${target}`, 'INVALID_TRANSITION');
    }
    if (rule.permission === PERMISSIONS.REQUESTS_ATTEND && locked.id_funcionario_activo !== user.id) {
      throw forbidden('Solo el funcionario asignado puede atender esta solicitud');
    }
    if (target === 'RESUELTA' && !(await trackingRepository.hasPublicResponseSinceStart(idSolicitud, client))) {
      throw conflict('Para resolver la solicitud registra antes una respuesta pública con la solución', 'RESPONSE_REQUIRED');
    }

    if (target === 'CERRADA') await trackingRepository.finishActiveAssignment(idSolicitud, client);
    await trackingRepository.updateState(idSolicitud, { estado: target, setResolution: target === 'RESUELTA', setClosing: target === 'CERRADA' }, client);
    await trackingRepository.insertHistory({
      idSolicitud, estadoAnterior: from, estadoNuevo: target, idUsuario: user.id, observacion, publica: rule.publicNote,
    }, client);

    let notifications = notificationsFor({ target, request, locked, actorId: user.id, reason: observacion });
    if (target === 'REABIERTA') {
      const supervisors = await trackingRepository.supervisorsOfDependency(request.id_dependencia, client);
      const recipients = new Set([locked.id_funcionario_activo, ...supervisors].filter(Boolean));
      notifications = [...recipients].map((idUsuario) => ({
        idUsuario, idSolicitud, tipo: rule.notification, titulo: 'Una solicitud fue reabierta',
        mensaje: `El estudiante reabrió la solicitud ${request.codigo}. Motivo: ${observacion}`,
      }));
    }
    await notificationRepository.insertMany(client, notifications.filter((n) => n.idUsuario !== user.id));

    await recordAuditInTransaction(client, {
      idUsuario: user.id, operacion: rule.notification, recurso: 'solicitudes', idRecurso: idSolicitud, resultado: 'EXITO',
      detalle: { estado_anterior: from, estado_nuevo: target, motivo: observacion ?? null }, ip,
    });
  });

  return requestService.get(idSolicitud, user);
}

/** Cambia la prioridad (administrador; supervisor en su ámbito). No es un cambio de estado: no va al historial de estados. */
async function changePriority(idSolicitud, { prioridad }, { user, ip }) {
  if (!can(user.rol, PERMISSIONS.REQUESTS_CHANGE_PRIORITY)) throw forbidden();
  await loadVisible(idSolicitud, user);

  await withTransaction(async (client) => {
    const locked = await lockOpen(idSolicitud, client);
    const current = (await requestRepository.findVisibleById(idSolicitud, REQUEST_SCOPES.ALL, user, client)).prioridad;
    if (current === prioridad) throw conflict('La solicitud ya tiene esa prioridad', 'SAME_PRIORITY');
    await trackingRepository.updatePriority(idSolicitud, prioridad, client);
    await recordAuditInTransaction(client, {
      idUsuario: user.id, operacion: 'SOLICITUD_PRIORIDAD_CAMBIADA', recurso: 'solicitudes', idRecurso: idSolicitud, resultado: 'EXITO',
      detalle: { de: current, a: prioridad, estado: locked.estado }, ip,
    });
  });
  return requestService.get(idSolicitud, user);
}

/** Respuesta del funcionario asignado (pública: la ve y se notifica al estudiante; interna: solo el personal). */
async function addResponse(idSolicitud, { contenido, visibilidad }, { user, ip }) {
  if (!can(user.rol, PERMISSIONS.RESPONSES_CREATE)) throw forbidden();
  const request = await loadVisible(idSolicitud, user);

  const idRespuesta = await withTransaction(async (client) => {
    const locked = await lockOpen(idSolicitud, client);
    if (locked.id_funcionario_activo !== user.id) throw forbidden('Solo el funcionario asignado puede responder esta solicitud');
    if (!RESPONSE_STATES.includes(locked.estado)) {
      throw conflict(`No se pueden registrar respuestas en una solicitud en estado ${locked.estado}`, 'INVALID_STATE');
    }
    const id = await trackingRepository.insertResponse({ idSolicitud, idUsuario: user.id, contenido, visibilidad }, client);
    if (visibilidad === 'PUBLICA') {
      await notificationRepository.insertMany(client, [{
        idUsuario: request.id_estudiante, idSolicitud, tipo: 'NUEVA_RESPUESTA', titulo: 'Tienes una nueva respuesta',
        mensaje: `El funcionario respondió tu solicitud ${request.codigo}.`,
      }]);
    }
    await recordAuditInTransaction(client, {
      idUsuario: user.id, operacion: 'RESPUESTA_CREADA', recurso: 'respuestas', idRecurso: id, resultado: 'EXITO',
      detalle: { id_solicitud: idSolicitud, visibilidad }, ip,
    });
    return id;
  });
  return trackingRepository.findResponseById(idRespuesta);
}

const canSeeInternal = (user) => can(user.rol, PERMISSIONS.RESPONSES_VIEW_INTERNAL);

/** Respuestas de la solicitud; el estudiante nunca recibe las internas. */
async function listResponses(idSolicitud, user) {
  await loadVisible(idSolicitud, user);
  return trackingRepository.listResponses(idSolicitud, canSeeInternal(user));
}

/**
 * Línea de tiempo cronológica: cambios de estado + respuestas (DECISIONES §4.4).
 * Al estudiante: sin respuestas internas, sin observaciones internas y sin nombres de supervisores/administradores.
 */
async function timeline(idSolicitud, user) {
  await loadVisible(idSolicitud, user);
  const staff = canSeeInternal(user);
  const [history, responses] = await Promise.all([
    trackingRepository.listHistory(idSolicitud),
    trackingRepository.listResponses(idSolicitud, staff),
  ]);

  const hideActor = (rol) => !staff && (rol === ROLES.SUPERVISOR || rol === ROLES.ADMINISTRADOR);
  const events = [
    ...history.map((h) => ({
      tipo: 'ESTADO', id: `e-${h.id_historial}`, fecha: h.fecha_cambio,
      usuario: hideActor(h.rol_usuario) ? MANAGEMENT_LABEL : h.usuario,
      rol_usuario: hideActor(h.rol_usuario) ? null : h.rol_usuario,
      estado_anterior: h.estado_anterior, estado_nuevo: h.estado_nuevo,
      observacion: staff || h.observacion_publica ? h.observacion : null,
      observacion_publica: h.observacion_publica,
      contenido: null, visibilidad: null,
    })),
    ...responses.map((r) => ({
      tipo: 'RESPUESTA', id: `r-${r.id_respuesta}`, fecha: r.creado_en, usuario: r.autor, rol_usuario: ROLES.FUNCIONARIO,
      estado_anterior: null, estado_nuevo: null, observacion: null, observacion_publica: null,
      contenido: r.contenido, visibilidad: r.visibilidad,
    })),
  ];
  const time = (e) => new Date(e.fecha).getTime();
  return events.sort((a, b) => time(a) - time(b) || (a.tipo === b.tipo ? 0 : a.tipo === 'ESTADO' ? -1 : 1) || a.id.localeCompare(b.id, 'en', { numeric: true }));
}

module.exports = { changeStatus, changePriority, addResponse, listResponses, timeline, MANAGEMENT_LABEL };
