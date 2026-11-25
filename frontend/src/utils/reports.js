/** Formato de cifras de indicadores y reportes. */

/** 15 → "15 h", 0.5 → "30 min", 50 → "2,1 días". null → "—". */
export function formatHours(hours) {
  if (hours === null || hours === undefined) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${String(Math.round(hours * 10) / 10).replace('.', ',')} h`;
  return `${String(Math.round((hours / 24) * 10) / 10).replace('.', ',')} días`;
}

/** 50 → "50 %"; null → "—". */
export function formatPercent(value) {
  if (value === null || value === undefined) return '—';
  return `${String(value).replace('.', ',')} %`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-03" → "mar 2026". */
export function monthLabel(period) {
  const [year, month] = period.split('-');
  return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

/** Fecha AAAA-MM-DD → 01/03/2026. */
export const formatYmd = (ymd) => ymd.split('-').reverse().join('/');

/** Descarga un Blob como archivo (para el CSV). */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
