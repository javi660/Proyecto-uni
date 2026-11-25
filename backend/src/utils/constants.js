'use strict';

/**
 * Constantes de dominio del backend. Sus valores coinciden exactamente con las
 * restricciones CHECK de database/schema.sql (el script `npm run db:verify`
 * comprueba esa coincidencia, incluido el grafo de transiciones).
 */

const ROLES = Object.freeze({
  ADMINISTRADOR: 'ADMINISTRADOR',
  ESTUDIANTE: 'ESTUDIANTE',
  FUNCIONARIO: 'FUNCIONARIO',
  SUPERVISOR: 'SUPERVISOR',
});

const REQUEST_STATES = Object.freeze({
  REGISTRADA: 'REGISTRADA',
  ASIGNADA: 'ASIGNADA',
  EN_PROCESO: 'EN_PROCESO',
  RESUELTA: 'RESUELTA',
  CERRADA: 'CERRADA',
  RECHAZADA: 'RECHAZADA',
  REABIERTA: 'REABIERTA',
});

const PRIORITIES = Object.freeze({
  BAJA: 'BAJA',
  NORMAL: 'NORMAL',
  ALTA: 'ALTA',
  URGENTE: 'URGENTE',
});

const RESPONSE_VISIBILITY = Object.freeze({
  PUBLICA: 'PUBLICA',
  INTERNA: 'INTERNA',
});

const NOTIFICATION_TYPES = Object.freeze({
  SOLICITUD_REGISTRADA: 'SOLICITUD_REGISTRADA',
  SOLICITUD_ASIGNADA: 'SOLICITUD_ASIGNADA',
  SOLICITUD_REASIGNADA: 'SOLICITUD_REASIGNADA',
  SOLICITUD_INICIADA: 'SOLICITUD_INICIADA',
  NUEVA_RESPUESTA: 'NUEVA_RESPUESTA',
  SOLICITUD_RESUELTA: 'SOLICITUD_RESUELTA',
  SOLICITUD_CERRADA: 'SOLICITUD_CERRADA',
  SOLICITUD_REABIERTA: 'SOLICITUD_REABIERTA',
  SOLICITUD_RECHAZADA: 'SOLICITUD_RECHAZADA',
});

/**
 * Grafo de transiciones permitidas (DECISIONES.md, sección 4.2).
 * Quién puede ejecutar cada transición se define en el servicio de solicitudes (Fase 8).
 */
const TRANSITIONS = Object.freeze({
  [REQUEST_STATES.REGISTRADA]: Object.freeze([REQUEST_STATES.ASIGNADA, REQUEST_STATES.RECHAZADA]),
  [REQUEST_STATES.ASIGNADA]: Object.freeze([REQUEST_STATES.EN_PROCESO]),
  [REQUEST_STATES.EN_PROCESO]: Object.freeze([REQUEST_STATES.RESUELTA]),
  [REQUEST_STATES.RESUELTA]: Object.freeze([REQUEST_STATES.CERRADA, REQUEST_STATES.REABIERTA]),
  [REQUEST_STATES.REABIERTA]: Object.freeze([REQUEST_STATES.ASIGNADA, REQUEST_STATES.EN_PROCESO]),
  [REQUEST_STATES.CERRADA]: Object.freeze([]),
  [REQUEST_STATES.RECHAZADA]: Object.freeze([]),
});

/** Estados finales: no admiten más cambios. */
const FINAL_STATES = Object.freeze([REQUEST_STATES.CERRADA, REQUEST_STATES.RECHAZADA]);

/** Estados que exigen una asignación activa (se validan también en la base de datos). */
const STATES_REQUIRING_ASSIGNMENT = Object.freeze([
  REQUEST_STATES.ASIGNADA,
  REQUEST_STATES.EN_PROCESO,
  REQUEST_STATES.RESUELTA,
  REQUEST_STATES.REABIERTA,
]);

/** @returns {boolean} true si el cambio de estado está en el grafo de transiciones. */
function canTransition(from, to) {
  return Array.isArray(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);
}

/** Códigos SQLSTATE propios definidos en database/schema.sql. */
const DB_ERROR_CODES = Object.freeze({
  INVALID_TRANSITION: 'SG001',
  BUSINESS_RULE: 'SG002',
  RESTRICT_VIOLATION: '23001',
});

module.exports = {
  ROLES,
  REQUEST_STATES,
  PRIORITIES,
  RESPONSE_VISIBILITY,
  NOTIFICATION_TYPES,
  TRANSITIONS,
  FINAL_STATES,
  STATES_REQUIRING_ASSIGNMENT,
  DB_ERROR_CODES,
  canTransition,
};
