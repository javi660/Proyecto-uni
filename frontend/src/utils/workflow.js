/**
 * Reglas de presentación del flujo de atención (espejo de backend/src/utils/stateMachine.js y de la matriz de
 * permisos, DECISIONES §4). El servidor es quien decide: esto solo evita mostrar botones que fallarían.
 */

export const FINAL_STATES = ['CERRADA', 'RECHAZADA'];
export const RESPONSE_STATES = ['ASIGNADA', 'EN_PROCESO', 'REABIERTA'];
export const PRIORITIES = ['BAJA', 'NORMAL', 'ALTA', 'URGENTE'];

export const isFinal = (request) => FINAL_STATES.includes(request?.estado);

const isManager = (user) => user?.rol === 'ADMINISTRADOR' || user?.rol === 'SUPERVISOR';
const isAssignedOfficial = (request, user) => user?.rol === 'FUNCIONARIO' && request.id_funcionario === user.id_usuario;
const isOwner = (request, user) => user?.rol === 'ESTUDIANTE' && request.id_estudiante === user.id_usuario;

/**
 * Acciones de cambio de estado disponibles para el usuario sobre la solicitud.
 * @returns {{estado: string, label: string, variant: 'primary'|'secondary'|'danger', reasonRequired: boolean, description: string}[]}
 */
export function availableActions(request, user) {
  if (!request || !user || isFinal(request)) return [];
  const actions = [];
  const { estado } = request;

  if (isAssignedOfficial(request, user)) {
    if (estado === 'ASIGNADA' || estado === 'REABIERTA') {
      actions.push({ estado: 'EN_PROCESO', label: 'Iniciar atención', variant: 'primary', reasonRequired: false, description: 'Marcarás la solicitud como en proceso y se notificará al estudiante.' });
    }
    if (estado === 'EN_PROCESO') {
      actions.push({ estado: 'RESUELTA', label: 'Marcar como resuelta', variant: 'primary', reasonRequired: false, description: 'Requiere haber publicado al menos una respuesta pública desde que iniciaste la atención.' });
    }
  }
  if (estado === 'RESUELTA' && (isManager(user) || isOwner(request, user))) {
    actions.push({ estado: 'CERRADA', label: 'Cerrar solicitud', variant: 'primary', reasonRequired: false, description: 'El cierre es definitivo: la solicitud ya no podrá modificarse.' });
  }
  if (estado === 'RESUELTA' && isOwner(request, user)) {
    actions.push({ estado: 'REABIERTA', label: 'Reabrir', variant: 'secondary', reasonRequired: true, description: 'Cuéntanos por qué la solución no resolvió tu solicitud.' });
  }
  if (estado === 'REGISTRADA' && isManager(user)) {
    actions.push({ estado: 'RECHAZADA', label: 'Rechazar', variant: 'danger', reasonRequired: true, description: 'El rechazo es definitivo. El estudiante verá el motivo.' });
  }
  return actions;
}

/** El funcionario asignado responde mientras la atiende (ASIGNADA, EN_PROCESO o REABIERTA). */
export const canRespond = (request, user) => isAssignedOfficial(request, user) && RESPONSE_STATES.includes(request.estado);

/** Administrador y supervisor cambian la prioridad mientras la solicitud siga abierta. */
export const canChangePriority = (request, user) => isManager(user) && !isFinal(request);

/** Solo el personal ve y escribe respuestas internas. */
export const canSeeInternal = (user) => Boolean(user) && user.rol !== 'ESTUDIANTE';
