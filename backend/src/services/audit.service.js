'use strict';

const auditRepository = require('../repositories/audit.repository');
const logger = require('../utils/logger');
const { notFound } = require('../utils/errors');
const { toRange } = require('../utils/period');

/**
 * Registra una operación sensible en la tabla de auditoría.
 *
 * Es de "mejor esfuerzo": si la auditoría falla (por ejemplo, la base no responde), el error
 * se registra en el log del servidor y NO interrumpe la operación principal. Nunca debe
 * recibir contraseñas, tokens ni secretos en `detalle`.
 *
 * @param {{idUsuario?: number|null, operacion: string, recurso: string, idRecurso?: string|number|null,
 *          resultado: 'EXITO'|'FALLO', detalle?: object|null, ip?: string|null}} entry
 */
async function recordAudit(entry) {
  try {
    await auditRepository.insert(entry);
  } catch (error) {
    logger.error('No se pudo registrar la auditoría', { operacion: entry.operacion, code: error.code });
  }
}

/**
 * Registra auditoría DENTRO de una transacción: si la auditoría falla, la operación completa
 * se revierte. Se usa en la configuración administrativa, donde no debe haber cambios sin rastro.
 * @param {import('pg').PoolClient} client
 */
function recordAuditInTransaction(client, entry) {
  return auditRepository.insert(entry, client);
}

const SENSITIVE_KEY = /pass(word)?|token|secret|hash|authorization|cookie|csrf/i;

/**
 * Última barrera de seguridad al CONSULTAR: aunque la auditoría nunca debe guardar secretos, cualquier clave
 * con aspecto de credencial (password, token, hash…) se enmascara antes de salir por la API.
 */
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, SENSITIVE_KEY.test(key) ? '[oculto]' : redact(inner)]));
  }
  return value;
}

const present = (row) => ({ ...row, detalle: redact(row.detalle) });

/** Consulta de auditoría (solo administrador, ver rutas). Las fechas del filtro son en hora de Bogotá. */
async function list(query) {
  const range = query.desde || query.hasta
    ? {
      desde: query.desde ? toRange({ desde: query.desde, hasta: query.desde }).desde : undefined,
      hasta: query.hasta ? toRange({ desde: query.hasta, hasta: query.hasta }).hasta : undefined,
    }
    : undefined;
  const { rows, total } = await auditRepository.list({
    page: query.page, pageSize: query.pageSize, operacion: query.operacion, recurso: query.recurso,
    idRecurso: query.id_recurso, idUsuario: query.id_usuario, resultado: query.resultado, range,
  });
  return { rows: rows.map(present), total };
}

async function get(id) {
  const row = await auditRepository.findById(id);
  if (!row) throw notFound('El registro de auditoría no existe');
  return present(row);
}

const filters = () => auditRepository.distinctValues();

module.exports = { recordAudit, recordAuditInTransaction, list, get, filters, redact };
