import api from './api.js';

/** Quita parámetros vacíos para no enviar "?q=&activo=" al servidor. */
export function cleanParams(params = {}) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

/** Respuesta de listado: { items, meta: { page, pageSize, total } } */
export const unwrapList = (response) => ({ items: response.data.data, meta: response.data.meta });

/**
 * Cliente REST genérico para un recurso de la API (listar, detalle, crear, editar, cambiar estado).
 * Los errores ya llegan normalizados como ApiError desde services/api.js.
 */
export function createResource(path) {
  return {
    list: async (params = {}) => unwrapList(await api.get(path, { params: cleanParams(params) })),
    get: async (id) => (await api.get(`${path}/${id}`)).data.data,
    create: async (body) => (await api.post(path, body)).data.data,
    update: async (id, body) => (await api.put(`${path}/${id}`, body)).data.data,
    setStatus: async (id, activo) => (await api.patch(`${path}/${id}/status`, { activo })).data.data,
  };
}
