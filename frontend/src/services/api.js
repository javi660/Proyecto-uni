import axios from 'axios';

/**
 * Cliente HTTP único hacia el backend.
 * - En desarrollo usa "/api" (Vite lo reenvía al backend); en producción usa VITE_API_URL.
 * - Envía cookies (sesión HttpOnly de la Fase 3).
 * - CSRF: en toda petición que cambia datos agrega la cabecera X-CSRF-Token con el valor de la
 *   cookie `sgssu_csrf`; si aún no existe, la solicita a GET /auth/csrf.
 * - Renovación de sesión: ante un 401 por token vencido o ausente, intenta UNA renovación
 *   (POST /auth/refresh, una sola a la vez aunque falle un grupo de peticiones) y repite la
 *   petición original. Si la renovación falla, avisa con el manejador registrado
 *   (setSessionExpiredHandler) para que la aplicación lleve al usuario al login.
 * - Normaliza TODOS los errores a la forma ApiError, para que los componentes
 *   no dependan de la estructura interna de Axios.
 *
 * El frontend nunca habla con Supabase: solo con esta API.
 */

export class ApiError extends Error {
  /**
   * @param {{status: number, code: string, message: string, details?: Array}} info
   */
  constructor({ status, code, message, details = [] }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Convierte cualquier error de Axios en un ApiError con mensaje en español. */
export function normalizeError(error) {
  if (error instanceof ApiError) return error;

  // El servidor respondió con el formato uniforme { ok:false, error:{ code, message, details } }
  const body = error?.response?.data;
  if (body && body.error && typeof body.error.message === 'string') {
    return new ApiError({
      status: error.response.status,
      code: body.error.code || 'UNKNOWN_ERROR',
      message: body.error.message,
      details: body.error.details || [],
    });
  }

  // El servidor respondió pero no con nuestro formato (p. ej. el proxy sin backend)
  if (error?.response) {
    return new ApiError({
      status: error.response.status,
      code: 'UNEXPECTED_RESPONSE',
      message: 'El servidor respondió de forma inesperada',
    });
  }

  // Tiempo de espera agotado
  if (error?.code === 'ECONNABORTED') {
    return new ApiError({
      status: 0,
      code: 'TIMEOUT',
      message: 'El servidor tardó demasiado en responder',
    });
  }

  // Sin respuesta: backend apagado o sin conexión
  return new ApiError({
    status: 0,
    code: 'NETWORK_ERROR',
    message: 'No fue posible comunicarse con el servidor. Verifica tu conexión',
  });
}

export const CSRF_COOKIE = 'sgssu_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';
const SAFE_METHODS = new Set(['get', 'head', 'options']);
// Rutas de autenticación que nunca disparan una renovación automática
const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/csrf'];
// Códigos 401 que sí se resuelven renovando la sesión
const REFRESHABLE_CODES = new Set(['TOKEN_EXPIRED', 'UNAUTHENTICATED']);

/** Lee una cookie legible por JavaScript (solo sgssu_csrf lo es). */
export function readCookie(name) {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  const found = document.cookie.split('; ').find((part) => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : null;
}

const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15000,
  headers: { Accept: 'application/json' },
});

// Cliente "crudo" (sin interceptores) para pedir CSRF y renovar sin recursión
const raw = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15000,
  headers: { Accept: 'application/json' },
});

let sessionExpiredHandler = null;

/** Registra la función que se ejecuta cuando la sesión no se puede renovar. */
export function setSessionExpiredHandler(handler) {
  sessionExpiredHandler = handler;
}

let csrfPromise = null;

/** Devuelve el token CSRF vigente; lo solicita al servidor si todavía no hay cookie. */
export async function ensureCsrfToken() {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;

  if (!csrfPromise) {
    csrfPromise = raw
      .get('/auth/csrf')
      .then((response) => response.data?.data?.csrf_token ?? readCookie(CSRF_COOKIE))
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

let refreshPromise = null;

/** Renueva la sesión (una sola vez a la vez). Devuelve true si se logró. */
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = ensureCsrfToken()
      .then((token) => raw.post('/auth/refresh', null, { headers: { [CSRF_HEADER]: token } }))
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.request.use(async (config) => {
  const method = (config.method || 'get').toLowerCase();
  if (!SAFE_METHODS.has(method)) {
    const token = await ensureCsrfToken();
    if (token) {
      config.headers.set(CSRF_HEADER, token);
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const normalized = normalizeError(error);
    const original = error?.config;

    const canRefresh =
      original &&
      !original.__retried &&
      normalized.status === 401 &&
      REFRESHABLE_CODES.has(normalized.code) &&
      !NO_REFRESH_PATHS.some((path) => (original.url || '').startsWith(path));

    if (canRefresh) {
      const refreshed = await refreshSession();
      if (refreshed) {
        original.__retried = true;
        return api.request(original);
      }
      if (sessionExpiredHandler) sessionExpiredHandler();
      return Promise.reject(normalized);
    }

    // Sesión revocada o inválida (logout en otra pestaña, usuario desactivado, etc.)
    if (
      normalized.status === 401 &&
      ['SESSION_REVOKED', 'SESSION_INVALID'].includes(normalized.code) &&
      sessionExpiredHandler
    ) {
      sessionExpiredHandler();
    }

    return Promise.reject(normalized);
  },
);

export default api;