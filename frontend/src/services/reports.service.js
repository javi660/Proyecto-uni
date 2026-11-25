import api from './api.js';
import { cleanParams } from './resource.js';

const get = async (path, params) => (await api.get(path, { params: cleanParams(params) })).data.data;

/** Indicadores y reportes (DECISIONES §5 y §10.12). Todos devuelven `periodo`, `ambito` y `criterio`. */
export const reportsApi = {
  dashboard: (params) => get('/dashboard', params),
  byStatus: (params) => get('/reports/by-status', params),
  byCategory: (params) => get('/reports/by-category', params),
  byDependency: (params) => get('/reports/by-dependency', params),
  byPeriod: (params) => get('/reports/by-period', params),

  /** Descarga el reporte como CSV. @returns {Promise<{blob: Blob, filename: string}>} */
  exportCsv: async (report, params) => {
    const response = await api.get(`/reports/${report}`, { params: cleanParams({ ...params, formato: 'csv' }), responseType: 'blob' });
    const disposition = response.headers?.['content-disposition'] ?? '';
    const match = /filename="?([^";]+)"?/i.exec(disposition);
    return { blob: response.data, filename: match ? match[1] : `${report}.csv` };
  },
};
