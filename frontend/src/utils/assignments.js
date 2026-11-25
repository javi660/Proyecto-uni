/** Reglas de presentación de la asignación (el servidor es quien decide; DECISIONES §4). */

/** Estados en los que se puede asignar (REGISTRADA) o reasignar (ASIGNADA, EN_PROCESO, REABIERTA). */
export const ASSIGNABLE_STATES = ['REGISTRADA', 'ASIGNADA', 'EN_PROCESO', 'REABIERTA'];

/** Administrador y supervisor; el supervisor solo ve (y asigna) las de sus dependencias. */
export function canAssign(request, user) {
  if (!request || !user) return false;
  if (user.rol !== 'ADMINISTRADOR' && user.rol !== 'SUPERVISOR') return false;
  return ASSIGNABLE_STATES.includes(request.estado);
}

/** Etiqueta del botón: asignar la primera vez, reasignar cuando ya hay responsable. */
export const assignActionLabel = (request) => (request.id_funcionario ? 'Reasignar' : 'Asignar');
