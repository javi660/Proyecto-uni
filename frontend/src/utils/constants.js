/**
 * Constantes de dominio compartidas por todo el frontend.
 * Los valores coinciden exactamente con los de la base de datos y el backend
 * (ver DECISIONES.md, secciones 3, 4 y 6).
 */

export const ROLES = Object.freeze({
  ADMINISTRADOR: 'ADMINISTRADOR',
  ESTUDIANTE: 'ESTUDIANTE',
  FUNCIONARIO: 'FUNCIONARIO',
  SUPERVISOR: 'SUPERVISOR',
});

export const REQUEST_STATES = Object.freeze({
  REGISTRADA: 'REGISTRADA',
  ASIGNADA: 'ASIGNADA',
  EN_PROCESO: 'EN_PROCESO',
  RESUELTA: 'RESUELTA',
  CERRADA: 'CERRADA',
  RECHAZADA: 'RECHAZADA',
  REABIERTA: 'REABIERTA',
});

export const PRIORITIES = Object.freeze({
  BAJA: 'BAJA',
  NORMAL: 'NORMAL',
  ALTA: 'ALTA',
  URGENTE: 'URGENTE',
});

export const RESPONSE_VISIBILITY = Object.freeze({
  PUBLICA: 'PUBLICA',
  INTERNA: 'INTERNA',
});

/** Zona horaria con la que se muestran todas las fechas. */
export const APP_TIME_ZONE = 'America/Bogota';
export const APP_LOCALE = 'es-CO';
