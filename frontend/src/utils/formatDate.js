import { APP_LOCALE, APP_TIME_ZONE } from './constants.js';

/**
 * El backend entrega fechas ISO 8601 (UTC). Toda la interfaz las muestra en America/Bogota.
 */

const dateTimeFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

const dateFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIME_ZONE,
  dateStyle: 'medium',
});

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Fecha y hora, p. ej. "21 nov 2026, 2:02 a. m." */
export function formatDateTime(value) {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : '—';
}

/** Solo la fecha, p. ej. "21 nov 2026" */
export function formatDate(value) {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : '—';
}
