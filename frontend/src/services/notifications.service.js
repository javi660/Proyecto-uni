import api from './api.js';
import { cleanParams, unwrapList } from './resource.js';

export const notificationsApi = {
  list: async (params = {}) => unwrapList(await api.get('/notifications', { params: cleanParams(params) })),
  /** @returns {Promise<number>} cantidad de notificaciones sin leer del usuario */
  unreadCount: async () => (await api.get('/notifications/unread-count')).data.data.no_leidas,
  markRead: async (id) => (await api.patch(`/notifications/${id}/read`)).data.data,
  markAllRead: async () => (await api.patch('/notifications/read-all')).data.data,
};
