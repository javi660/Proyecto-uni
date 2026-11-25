import api from './api.js';

/**
 * Llamadas de autenticación. Los nombres de campo del cuerpo coinciden con los del backend
 * (español, snake_case). Los tokens viajan solo en cookies HttpOnly: este código nunca los ve.
 */

/** @returns {Promise<object>} usuario público { id_usuario, nombres, ..., rol, debe_cambiar_password } */
export async function login({ correo, password }) {
  const { data } = await api.post('/auth/login', { correo, password });
  return data.data.user;
}

export async function logout() {
  await api.post('/auth/logout');
}

/** Usuario de la sesión actual (lanza ApiError 401 si no hay sesión). */
export async function getMe() {
  const { data } = await api.get('/auth/me');
  return data.data.user;
}

export async function changePassword({ passwordActual, passwordNueva }) {
  const { data } = await api.patch('/auth/password', {
    password_actual: passwordActual,
    password_nueva: passwordNueva,
  });
  return data.data.user;
}
