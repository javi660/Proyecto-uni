import api from './api.js';
import { cleanParams, unwrapList } from './resource.js';

/** Consulta de auditoría (solo administrador). La API no permite modificar ni borrar registros. */
export const auditApi = {
  list: async (params = {}) => unwrapList(await api.get('/audit', { params: cleanParams(params) })),
  get: async (id) => (await api.get(`/audit/${id}`)).data.data,
  /** @returns {Promise<{operaciones: string[], recursos: string[]}>} valores existentes, para los filtros */
  filters: async () => (await api.get('/audit/filters')).data.data,
};
