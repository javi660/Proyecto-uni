'use strict';

/**
 * Periodos de los indicadores (DECISIONES §5.4). Todo en America/Bogota (UTC-5, sin horario de verano).
 * Las fechas se manejan como texto AAAA-MM-DD; `hasta` es inclusivo.
 */

const BOGOTA_OFFSET_MS = -5 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

const pad = (n) => String(n).padStart(2, '0');
const toYmd = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** "Hoy" en Bogotá como Date en UTC con la hora de Bogotá (solo se usan getUTC*). */
const bogotaNow = (now = new Date()) => new Date(now.getTime() + BOGOTA_OFFSET_MS);

/** Primer y último día del mes en curso. */
function currentMonth(now = new Date()) {
  const b = bogotaNow(now);
  const first = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1));
  const last = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0));
  return { desde: toYmd(first), hasta: toYmd(last) };
}

/** Desde el primer día de hace (months-1) meses hasta el último día del mes en curso. */
function lastMonths(months, now = new Date()) {
  const b = bogotaNow(now);
  const first = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() - (months - 1), 1));
  const last = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0));
  return { desde: toYmd(first), hasta: toYmd(last) };
}

/**
 * @param {{desde?: string, hasta?: string}} query
 * @param {{desde: string, hasta: string}} fallback periodo por defecto
 * @returns {{desde: string, hasta: string, por_defecto: boolean}}
 */
function resolvePeriod(query, fallback) {
  if (!query.desde && !query.hasta) return { ...fallback, por_defecto: true };
  return {
    desde: query.desde ?? fallback.desde,
    hasta: query.hasta ?? (query.desde > fallback.hasta ? query.desde : fallback.hasta),
    por_defecto: false,
  };
}

/** Rango para SQL: [desde 00:00, día siguiente a hasta 00:00) en hora de Bogotá, como ISO UTC. */
function toRange({ desde, hasta }) {
  return {
    desde: new Date(Date.parse(`${desde}T00:00:00-05:00`)).toISOString(),
    hasta: new Date(Date.parse(`${hasta}T00:00:00-05:00`) + DAY_MS).toISOString(),
  };
}

/** Lista de meses AAAA-MM entre dos fechas (ambas incluidas). */
function monthsBetween({ desde, hasta }) {
  const out = [];
  let [y, m] = desde.split('-').map(Number);
  const [ey, em] = hasta.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** 01/10/2026 */
const formatDmy = (ymd) => ymd.split('-').reverse().join('/');

module.exports = { currentMonth, lastMonths, resolvePeriod, toRange, monthsBetween, formatDmy };
