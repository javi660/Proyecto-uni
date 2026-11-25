'use strict';

const { PERMISSIONS } = require('./permissions');

/**
 * Máquina de estados de la solicitud (DECISIONES §4.2). Es el espejo de `fn_transicion_permitida`
 * de la base de datos, que actúa como última barrera.
 *
 * Las transiciones a ASIGNADA no pasan por aquí: ocurren al asignar/reasignar (assignment.service).
 */

const STATES = Object.freeze({
  REGISTRADA: 'REGISTRADA', ASIGNADA: 'ASIGNADA', EN_PROCESO: 'EN_PROCESO', RESUELTA: 'RESUELTA',
  CERRADA: 'CERRADA', RECHAZADA: 'RECHAZADA', REABIERTA: 'REABIERTA',
});

const FINAL_STATES = Object.freeze([STATES.CERRADA, STATES.RECHAZADA]);

/** Estados que se pueden pedir con PATCH /requests/:id/status. */
const STATUS_TARGETS = Object.freeze([STATES.EN_PROCESO, STATES.RESUELTA, STATES.CERRADA, STATES.REABIERTA, STATES.RECHAZADA]);

/**
 * Por cada estado destino: desde qué estados, qué permiso exige, si el motivo es obligatorio,
 * si la observación queda visible para el estudiante y el tipo de notificación.
 */
const TARGETS = Object.freeze({
  [STATES.EN_PROCESO]: {
    from: [STATES.ASIGNADA, STATES.REABIERTA], permission: PERMISSIONS.REQUESTS_ATTEND,
    reasonRequired: false, publicNote: true, notification: 'SOLICITUD_INICIADA',
  },
  [STATES.RESUELTA]: {
    from: [STATES.EN_PROCESO], permission: PERMISSIONS.REQUESTS_ATTEND,
    reasonRequired: false, publicNote: true, notification: 'SOLICITUD_RESUELTA',
  },
  [STATES.CERRADA]: {
    from: [STATES.RESUELTA], permission: PERMISSIONS.REQUESTS_CLOSE,
    reasonRequired: false, publicNote: true, notification: 'SOLICITUD_CERRADA',
  },
  [STATES.REABIERTA]: {
    from: [STATES.RESUELTA], permission: PERMISSIONS.REQUESTS_REOPEN,
    reasonRequired: true, publicNote: true, notification: 'SOLICITUD_REABIERTA',
  },
  [STATES.RECHAZADA]: {
    from: [STATES.REGISTRADA], permission: PERMISSIONS.REQUESTS_REJECT,
    reasonRequired: true, publicNote: true, notification: 'SOLICITUD_RECHAZADA',
  },
});

const isFinal = (state) => FINAL_STATES.includes(state);

/** ¿Es válida la transición pedida por estado destino? (no incluye ASIGNADA) */
function canTransition(from, to) {
  const rule = TARGETS[to];
  return Boolean(rule) && rule.from.includes(from);
}

/** Estados a los que se puede pasar desde `from` mediante PATCH /status. */
const nextTargets = (from) => STATUS_TARGETS.filter((to) => canTransition(from, to));

/** Estados en que el funcionario puede registrar respuestas. */
const RESPONSE_STATES = Object.freeze([STATES.ASIGNADA, STATES.EN_PROCESO, STATES.REABIERTA]);

module.exports = { STATES, FINAL_STATES, STATUS_TARGETS, TARGETS, RESPONSE_STATES, isFinal, canTransition, nextTargets };
