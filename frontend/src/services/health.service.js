import api from './api.js';

/**
 * Verificación del servidor y de la base de datos.
 * Devuelven el campo `data` del formato uniforme de la API.
 */

export async function getApiHealth() {
  const response = await api.get('/health');
  return response.data.data;
}

export async function getDatabaseHealth() {
  const response = await api.get('/health/db');
  return response.data.data;
}
