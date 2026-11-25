import api, { ApiError } from './api.js';
import { cleanParams, unwrapList } from './resource.js';

/** Cuando la descarga falla, el cuerpo del error llega como Blob: se lee para mostrar el mensaje real. */
async function blobError(error) {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      const body = JSON.parse(await data.text());
      if (body?.error?.message) {
        return new ApiError({ status: error.response.status, code: body.error.code || 'UNKNOWN_ERROR', message: body.error.message, details: body.error.details || [] });
      }
    } catch {
      // cuerpo no JSON: se deja el error normalizado por defecto
    }
  }
  return error;
}

export const requestsApi = {
  list: async (params = {}) => unwrapList(await api.get('/requests', { params: cleanParams(params) })),
  listMine: async (params = {}) => unwrapList(await api.get('/requests/my', { params: cleanParams(params) })),
  get: async (id) => (await api.get(`/requests/${id}`)).data.data,
  create: async (body) => (await api.post('/requests', body)).data.data,

  /** Asigna (REGISTRADA) o reasigna (ASIGNADA, EN_PROCESO, REABIERTA); devuelve la solicitud actualizada. */
  assign: async (id, body) => (await api.post(`/requests/${id}/assignment`, body)).data.data,
  listAssignments: async (id) => (await api.get(`/requests/${id}/assignments`)).data.data,

  changeStatus: async (id, body) => (await api.patch(`/requests/${id}/status`, body)).data.data,
  changePriority: async (id, prioridad) => (await api.patch(`/requests/${id}/priority`, { prioridad })).data.data,
  listResponses: async (id) => (await api.get(`/requests/${id}/responses`)).data.data,
  addResponse: async (id, body) => (await api.post(`/requests/${id}/responses`, body)).data.data,
  getTimeline: async (id) => (await api.get(`/requests/${id}/timeline`)).data.data,
  listAttachments: async (id) => (await api.get(`/requests/${id}/attachments`)).data.data,

  /** Sube UN archivo (multipart, campo "archivo"). */
  uploadAttachment: async (id, file) => {
    const form = new FormData();
    form.append('archivo', file, file.name);
    return (await api.post(`/requests/${id}/attachments`, form)).data.data;
  },

  /** Descarga un adjunto y lo entrega al navegador como archivo. */
  downloadAttachment: async (attachment) => {
    let response;
    try {
      response = await api.get(`/attachments/${attachment.id_adjunto}/download`, { responseType: 'blob' });
    } catch (error) {
      throw await blobError(error);
    }
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.nombre_original;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

/** Funcionarios activos asignables (el servidor limita al ámbito del supervisor). */
export const officialsApi = {
  list: async (params = {}) => unwrapList(await api.get('/officials', { params: cleanParams(params) })),
};
