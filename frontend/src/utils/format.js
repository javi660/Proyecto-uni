const TIME_ZONE = 'America/Bogota';

const dateTime = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: TIME_ZONE });
const dateOnly = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: TIME_ZONE });

/** Fecha y hora en zona America/Bogota ("—" si no hay valor o no es válido). */
export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date);
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateOnly.format(date);
}
