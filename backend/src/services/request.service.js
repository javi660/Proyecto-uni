'use strict';

const { withTransaction } = require('../config/database');
const requestRepository = require('../repositories/request.repository');
const serviceRepository = require('../repositories/service.repository');
const trackingRepository = require('../repositories/tracking.repository');
const notificationRepository = require('../repositories/notification.repository');
const { recordAuditInTransaction } = require('./audit.service');
const { notFound, conflict } = require('../utils/errors');
const { REQUEST_SCOPES, requestScopeFor } = require('../utils/permissions');

/** Casos de uso de solicitudes (Fase 6: registro y consulta). */

const toDto = (row) => ({ ...row, total_adjuntos: Number(row.total_adjuntos) });

/** Registra una solicitud. Estado inicial, propietario y prioridad los decide el backend. */
async function create({ id_servicio: idServicio, asunto, descripcion }, { user, ip }) {
  return withTransaction(async (client) => {
    const service = await serviceRepository.findById(idServicio, client);
    if (!service) throw notFound('El servicio seleccionado no existe');
    if (!service.activo) throw conflict('El servicio seleccionado no está disponible', 'SERVICE_INACTIVE');

    const idSolicitud = await requestRepository.insert({ idEstudiante: user.id, idServicio, asunto, descripcion }, client);
    await requestRepository.insertInitialHistory({ idSolicitud, idUsuario: user.id }, client);
    const created = await requestRepository.findVisibleById(idSolicitud, REQUEST_SCOPES.ALL, user, client);

    await recordAuditInTransaction(client, {
      idUsuario: user.id, operacion: 'SOLICITUD_CREADA', recurso: 'solicitudes', idRecurso: idSolicitud,
      resultado: 'EXITO', detalle: { codigo: created.codigo, id_servicio: idServicio }, ip,
    });

    // Notificaciones del registro (§8): el estudiante y los supervisores de la dependencia del servicio (sin el actor)
    const supervisors = await trackingRepository.supervisorsOfDependency(service.id_dependencia, client);
    const recipients = [{ id: user.id, titulo: 'Solicitud registrada', mensaje: `Tu solicitud ${created.codigo} fue registrada.` }]
      .concat(supervisors.map((id) => ({ id, titulo: 'Nueva solicitud en tu dependencia', mensaje: `Se registró la solicitud ${created.codigo}: ${created.asunto}.` })));
    await notificationRepository.insertMany(client, recipients.map((r) => ({
      idUsuario: r.id, idSolicitud, tipo: 'SOLICITUD_REGISTRADA', titulo: r.titulo, mensaje: r.mensaje,
    })));
    return { ...toDto(created), adjuntos: [] };
  });
}

/** Listado según el alcance del perfil. `forceOwn` limita a las propias (GET /my). */
async function list(query, user, { forceOwn = false } = {}) {
  const scope = forceOwn ? REQUEST_SCOPES.OWN : requestScopeFor(user.rol);
  const { rows, total } = await requestRepository.list({ ...query, scope, user });
  return { rows: rows.map(toDto), total };
}

/** Detalle con adjuntos. Fuera de alcance se responde 404 para no revelar que existe. */
async function get(id, user) {
  const row = await requestRepository.findVisibleById(id, requestScopeFor(user.rol), user);
  if (!row) throw notFound('La solicitud no existe o no tienes acceso a ella');
  const adjuntos = await requestRepository.listAttachments(id);
  return { ...toDto(row), adjuntos };
}

module.exports = { create, list, get };
