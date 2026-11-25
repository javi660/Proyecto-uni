'use strict';

const { withTransaction } = require('../config/database');
const requestRepository = require('../repositories/request.repository');
const assignmentRepository = require('../repositories/assignment.repository');
const notificationRepository = require('../repositories/notification.repository');
const requestService = require('./request.service');
const { recordAuditInTransaction } = require('./audit.service');
const { notFound, conflict } = require('../utils/errors');
const { ROLES } = require('../utils/constants');
const { requestScopeFor } = require('../utils/permissions');

const NOT_FOUND_MESSAGE = 'La solicitud no existe o no tienes acceso a ella';
/** Estados en los que se puede asignar (primera vez) o reasignar. RESUELTA no admite cambios de responsable. */
const ASSIGNABLE = ['REGISTRADA', 'ASIGNADA', 'EN_PROCESO', 'REABIERTA'];

const fullName = (u) => `${u.nombres} ${u.apellidos}`;

/** Un supervisor solo ve (y por tanto solo asigna) lo de sus dependencias; fuera de alcance => 404. */
async function loadVisible(idSolicitud, user) {
  const row = await requestRepository.findVisibleById(idSolicitud, requestScopeFor(user.rol), user);
  if (!row) throw notFound(NOT_FOUND_MESSAGE);
  return row;
}

async function validateOfficial(idFuncionario, visibleRequest, client) {
  const official = await assignmentRepository.findOfficialById(idFuncionario, client);
  if (!official) throw notFound('El funcionario seleccionado no existe');
  if (official.rol !== ROLES.FUNCIONARIO) throw conflict('El usuario seleccionado no es un funcionario', 'NOT_AN_OFFICIAL');
  if (!official.activo) throw conflict('El funcionario seleccionado está inactivo', 'OFFICIAL_INACTIVE');
  if (official.id_dependencia !== visibleRequest.id_dependencia) {
    throw conflict('El funcionario no pertenece a la dependencia que atiende este servicio', 'OFFICIAL_WRONG_DEPENDENCY');
  }
  return official;
}

/**
 * Asigna (REGISTRADA) o reasigna (ASIGNADA, EN_PROCESO, REABIERTA) una solicitud, en una sola transacción:
 * finaliza la asignación activa, crea la nueva, cambia el estado cuando corresponde, e inserta
 * historial, auditoría y notificaciones (DECISIONES §4 y §10.9).
 */
async function assign(idSolicitud, { id_funcionario: idFuncionario, observacion }, { user, ip }) {
  const visible = await loadVisible(idSolicitud, user);

  await withTransaction(async (client) => {
    const locked = await requestRepository.lockById(idSolicitud, client);
    if (!locked) throw notFound(NOT_FOUND_MESSAGE);
    const { estado } = locked;

    if (['CERRADA', 'RECHAZADA'].includes(estado)) {
      throw conflict('La solicitud ya no admite asignaciones', 'REQUEST_CLOSED');
    }
    if (!ASSIGNABLE.includes(estado)) {
      throw conflict(`No se puede asignar una solicitud en estado ${estado}`, 'INVALID_STATE');
    }
    if (locked.id_funcionario_activo === idFuncionario) {
      throw conflict('La solicitud ya está asignada a ese funcionario', 'SAME_ASSIGNEE');
    }

    const official = await validateOfficial(idFuncionario, visible, client);
    const previousId = locked.id_funcionario_activo;
    const isReassignment = previousId !== null && previousId !== undefined;
    const newState = estado === 'REGISTRADA' || estado === 'REABIERTA' ? 'ASIGNADA' : estado;

    const previous = await assignmentRepository.finishActive(idSolicitud, client);
    const idAsignacion = await assignmentRepository.insert({ idSolicitud, idFuncionario, idAsignador: user.id, observacion }, client);

    if (newState !== estado) {
      await assignmentRepository.setRequestState(idSolicitud, newState, client);
      await assignmentRepository.insertStateHistory({
        idSolicitud, estadoAnterior: estado, estadoNuevo: newState, idUsuario: user.id,
        observacion: observacion || (isReassignment ? 'Solicitud reasignada' : 'Solicitud asignada'),
      }, client);
    }

    const codigo = visible.codigo;
    const notifications = [];
    if (isReassignment) {
      notifications.push(
        { idUsuario: visible.id_estudiante, idSolicitud, tipo: 'SOLICITUD_REASIGNADA', titulo: 'Tu solicitud fue reasignada', mensaje: `La solicitud ${codigo} ahora la atiende ${fullName(official)}.` },
        { idUsuario: idFuncionario, idSolicitud, tipo: 'SOLICITUD_REASIGNADA', titulo: 'Te reasignaron una solicitud', mensaje: `Se te asignó la solicitud ${codigo}: ${visible.asunto}.` },
      );
      if (previous) {
        notifications.push({ idUsuario: previous.id_funcionario, idSolicitud, tipo: 'SOLICITUD_REASIGNADA', titulo: 'Una solicitud ya no está a tu cargo', mensaje: `La solicitud ${codigo} fue reasignada a otro funcionario.` });
      }
    } else {
      notifications.push(
        { idUsuario: visible.id_estudiante, idSolicitud, tipo: 'SOLICITUD_ASIGNADA', titulo: 'Tu solicitud fue asignada', mensaje: `La solicitud ${codigo} fue asignada a ${fullName(official)}.` },
        { idUsuario: idFuncionario, idSolicitud, tipo: 'SOLICITUD_ASIGNADA', titulo: 'Tienes una nueva solicitud', mensaje: `Se te asignó la solicitud ${codigo}: ${visible.asunto}.` },
      );
    }
    await notificationRepository.insertMany(client, notifications);

    await recordAuditInTransaction(client, {
      idUsuario: user.id, operacion: isReassignment ? 'SOLICITUD_REASIGNADA' : 'SOLICITUD_ASIGNADA', recurso: 'solicitudes', idRecurso: idSolicitud,
      resultado: 'EXITO',
      detalle: { id_asignacion: idAsignacion, de: previousId ?? null, a: idFuncionario, estado_anterior: estado, estado_nuevo: newState },
      ip,
    });
  });

  return requestService.get(idSolicitud, user);
}

async function listForRequest(idSolicitud, user) {
  await loadVisible(idSolicitud, user);
  const rows = await assignmentRepository.listByRequest(idSolicitud);
  // DECISIONES §4.4: el estudiante ve al funcionario responsable, pero no quién asignó ni las observaciones internas.
  if (user.rol === ROLES.ESTUDIANTE) return rows.map((row) => ({ ...row, id_asignador: null, asignador: null, observacion: null }));
  return rows;
}

/** Funcionarios asignables. El supervisor solo ve los de las dependencias que supervisa. */
async function listOfficials(query, user) {
  const supervisorId = user.rol === ROLES.SUPERVISOR ? user.id : undefined;
  return assignmentRepository.listOfficials({ ...query, supervisorId });
}

module.exports = { assign, listForRequest, listOfficials };
