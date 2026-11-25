import { REQUEST_STATES, PRIORITIES } from './constants.js';

/**
 * Etiqueta y color de cada estado y prioridad. Es la ÚNICA definición:
 * los componentes (StatusBadge, gráficos, línea de tiempo) deben leerla de aquí.
 * Los colores apuntan a las variables CSS de styles/tokens.css.
 */

export const STATE_META = Object.freeze({
  [REQUEST_STATES.REGISTRADA]: { label: 'Registrada', cssVar: '--status-registrada', color: '#3679b8' },
  [REQUEST_STATES.ASIGNADA]: { label: 'Asignada', cssVar: '--status-asignada', color: '#245a91' },
  [REQUEST_STATES.EN_PROCESO]: { label: 'En proceso', cssVar: '--status-en-proceso', color: '#e6a23c' },
  [REQUEST_STATES.RESUELTA]: { label: 'Resuelta', cssVar: '--status-resuelta', color: '#198754' },
  [REQUEST_STATES.CERRADA]: { label: 'Cerrada', cssVar: '--status-cerrada', color: '#718096' },
  [REQUEST_STATES.RECHAZADA]: { label: 'Rechazada', cssVar: '--status-rechazada', color: '#dc3545' },
  [REQUEST_STATES.REABIERTA]: { label: 'Reabierta', cssVar: '--status-reabierta', color: '#b7791f' },
});

export const PRIORITY_META = Object.freeze({
  [PRIORITIES.BAJA]: { label: 'Baja', cssVar: '--priority-baja', color: '#718096' },
  [PRIORITIES.NORMAL]: { label: 'Normal', cssVar: '--priority-normal', color: '#3679b8' },
  [PRIORITIES.ALTA]: { label: 'Alta', cssVar: '--priority-alta', color: '#e6a23c' },
  [PRIORITIES.URGENTE]: { label: 'Urgente', cssVar: '--priority-urgente', color: '#dc3545' },
});

const FALLBACK = { label: 'Desconocido', cssVar: '--color-text-muted', color: '#718096' };

export const getStateMeta = (state) => STATE_META[state] ?? FALLBACK;
export const getPriorityMeta = (priority) => PRIORITY_META[priority] ?? FALLBACK;
