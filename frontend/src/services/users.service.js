import api from './api.js';
import { createResource } from './resource.js';

/** Administración de usuarios (solo administrador). Los nombres de campo replican los del backend. */
const base = createResource('/users');

export const usersApi = {
  ...base,
  resetPassword: async (id, passwordNueva) =>
    (await api.patch(`/users/${id}/password-reset`, { password_nueva: passwordNueva })).data.data,
  getSupervision: async (id) => (await api.get(`/users/${id}/supervision`)).data.data,
  setSupervision: async (id, idsDependencias) =>
    (await api.put(`/users/${id}/supervision`, { ids_dependencias: idsDependencias })).data.data,
};
